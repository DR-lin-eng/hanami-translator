use std::{
    fs,
    path::{Path, PathBuf},
};

use image::{ImageBuffer, Rgba, RgbaImage};
use uuid::Uuid;

use crate::{
    domain::{MaskKind, MaskRegion, NormalizedRect},
    error::AppResult,
};

const PRIVACY_PADDING: f32 = 0.015;

pub struct PrivacyArtifacts {
    pub image_path: PathBuf,
    pub image_width: u32,
    pub image_height: u32,
    pub mask_path: Option<PathBuf>,
    pub privacy_region_count: usize,
    pub privacy_restore_padding: f32,
    pub text_region_count: usize,
}

pub fn create_privacy_artifacts(
    source_path: &Path,
    regions: &[MaskRegion],
    output_root: &Path,
) -> AppResult<PrivacyArtifacts> {
    let source = image::open(source_path)?.to_rgba8();
    let (width, height) = source.dimensions();
    let text_regions: Vec<&MaskRegion> = regions
        .iter()
        .filter(|region| region.kind == MaskKind::TextEdit)
        .collect();
    let privacy_regions: Vec<&MaskRegion> = regions
        .iter()
        .filter(|region| region.kind == MaskKind::Privacy)
        .collect();

    let neutral = Rgba([232, 232, 236, 255]);
    let mut sanitized = if text_regions.is_empty() {
        source.clone()
    } else {
        let mut isolated = ImageBuffer::from_pixel(width, height, neutral);
        for region in &text_regions {
            copy_rect(&source, &mut isolated, region.rect, 0.012);
        }
        isolated
    };

    // Privacy always wins. With text regions, every pixel outside those regions
    // is already neutralized before the network request.
    for region in &privacy_regions {
        fill_rect(&mut sanitized, region.rect, neutral, PRIVACY_PADDING);
    }

    let job_dir = output_root.join(Uuid::new_v4().to_string());
    fs::create_dir_all(&job_dir)?;
    let image_path = job_dir.join("isolated-input.png");
    sanitized.save(&image_path)?;

    let mask_path = if text_regions.is_empty() && privacy_regions.is_empty() {
        None
    } else {
        let initial = if text_regions.is_empty() {
            Rgba([0, 0, 0, 0])
        } else {
            Rgba([255, 255, 255, 255])
        };
        let mut mask: RgbaImage = ImageBuffer::from_pixel(width, height, initial);
        for region in &text_regions {
            fill_rect(&mut mask, region.rect, Rgba([0, 0, 0, 0]), 0.012);
        }
        // Privacy always wins when the two kinds overlap.
        for region in &privacy_regions {
            fill_rect(
                &mut mask,
                region.rect,
                Rgba([255, 255, 255, 255]),
                PRIVACY_PADDING,
            );
        }
        let path = job_dir.join("edit-mask.png");
        mask.save(&path)?;
        Some(path)
    };

    Ok(PrivacyArtifacts {
        image_path,
        image_width: width,
        image_height: height,
        mask_path,
        privacy_region_count: privacy_regions.len(),
        privacy_restore_padding: if privacy_regions.is_empty() {
            0.0
        } else {
            PRIVACY_PADDING
        },
        text_region_count: text_regions.len(),
    })
}

fn fill_rect(image: &mut RgbaImage, rect: NormalizedRect, color: Rgba<u8>, padding: f32) {
    let (width, height) = image.dimensions();
    let (x0, y0, x1, y1) = pixel_bounds(rect, width, height, padding);
    for y in y0..y1 {
        for x in x0..x1 {
            image.put_pixel(x, y, color);
        }
    }
}

fn copy_rect(source: &RgbaImage, destination: &mut RgbaImage, rect: NormalizedRect, padding: f32) {
    let (width, height) = source.dimensions();
    let (x0, y0, x1, y1) = pixel_bounds(rect, width, height, padding);
    for y in y0..y1 {
        for x in x0..x1 {
            destination.put_pixel(x, y, *source.get_pixel(x, y));
        }
    }
}

fn pixel_bounds(
    rect: NormalizedRect,
    width: u32,
    height: u32,
    padding: f32,
) -> (u32, u32, u32, u32) {
    let rect = rect.clamped();
    let x0 = ((rect.x - padding).max(0.0) * width as f32).floor() as u32;
    let y0 = ((rect.y - padding).max(0.0) * height as f32).floor() as u32;
    let x1 = ((rect.x + rect.width + padding).min(1.0) * width as f32).ceil() as u32;
    let y1 = ((rect.y + rect.height + padding).min(1.0) * height as f32).ceil() as u32;
    (x0.min(width), y0.min(height), x1.min(width), y1.min(height))
}

#[cfg(test)]
mod tests {
    use image::{ImageBuffer, Rgba};
    use tempfile::tempdir;

    use super::create_privacy_artifacts;
    use crate::domain::{MaskKind, MaskRegion, NormalizedRect};

    #[test]
    fn redacts_privacy_and_keeps_edit_mask_separate() {
        let temp = tempdir().unwrap();
        let source_path = temp.path().join("source.png");
        ImageBuffer::from_pixel(100, 100, Rgba([12u8, 34, 56, 255]))
            .save(&source_path)
            .unwrap();
        let regions = vec![
            MaskRegion {
                id: "text".into(),
                kind: MaskKind::TextEdit,
                rect: NormalizedRect {
                    x: 0.1,
                    y: 0.1,
                    width: 0.2,
                    height: 0.2,
                },
            },
            MaskRegion {
                id: "private".into(),
                kind: MaskKind::Privacy,
                rect: NormalizedRect {
                    x: 0.6,
                    y: 0.6,
                    width: 0.2,
                    height: 0.2,
                },
            },
        ];

        let artifacts = create_privacy_artifacts(&source_path, &regions, temp.path()).unwrap();
        let sanitized = image::open(artifacts.image_path).unwrap().to_rgba8();
        let mask = image::open(artifacts.mask_path.unwrap())
            .unwrap()
            .to_rgba8();

        assert_eq!(sanitized.get_pixel(70, 70).0, [232, 232, 236, 255]);
        assert_eq!(sanitized.get_pixel(20, 20).0, [12, 34, 56, 255]);
        assert_eq!(sanitized.get_pixel(50, 50).0, [232, 232, 236, 255]);
        assert_eq!(mask.get_pixel(20, 20).0[3], 0);
        assert_eq!(mask.get_pixel(70, 70).0[3], 255);
    }

    #[test]
    fn keeps_the_full_page_when_no_text_regions_are_selected() {
        let temp = tempdir().unwrap();
        let source_path = temp.path().join("source.png");
        ImageBuffer::from_pixel(20, 20, Rgba([12u8, 34, 56, 255]))
            .save(&source_path)
            .unwrap();

        let artifacts = create_privacy_artifacts(&source_path, &[], temp.path()).unwrap();
        let sanitized = image::open(artifacts.image_path).unwrap().to_rgba8();

        assert_eq!(sanitized.get_pixel(10, 10).0, [12, 34, 56, 255]);
        assert!(artifacts.mask_path.is_none());
    }

    #[test]
    fn privacy_only_uses_an_opaque_mask_to_prevent_reconstruction() {
        let temp = tempdir().unwrap();
        let source_path = temp.path().join("source.png");
        ImageBuffer::from_pixel(100, 100, Rgba([12u8, 34, 56, 255]))
            .save(&source_path)
            .unwrap();
        let regions = vec![MaskRegion {
            id: "private".into(),
            kind: MaskKind::Privacy,
            rect: NormalizedRect {
                x: 0.4,
                y: 0.4,
                width: 0.2,
                height: 0.2,
            },
        }];

        let artifacts = create_privacy_artifacts(&source_path, &regions, temp.path()).unwrap();
        let sanitized = image::open(artifacts.image_path).unwrap().to_rgba8();
        let mask = image::open(artifacts.mask_path.unwrap())
            .unwrap()
            .to_rgba8();

        assert_eq!(sanitized.get_pixel(50, 50).0, [232, 232, 236, 255]);
        assert_eq!(sanitized.get_pixel(10, 10).0, [12, 34, 56, 255]);
        assert_eq!(mask.get_pixel(50, 50).0[3], 255);
        assert_eq!(mask.get_pixel(10, 10).0[3], 0);
        assert_eq!(artifacts.privacy_restore_padding, 0.015);
    }
}
