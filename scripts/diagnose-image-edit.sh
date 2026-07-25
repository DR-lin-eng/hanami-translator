#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: diagnose-image-edit.sh <api-base> <png-path>" >&2
  exit 64
fi

diagnostic_api_base=${1%/}
diagnostic_image_path=$2
diagnostic_response_path="/private/tmp/hanami-image-edit-response.$$"
diagnostic_header_path="/private/tmp/hanami-image-edit-headers.$$"
trap 'rm -f "$diagnostic_response_path" "$diagnostic_header_path"' EXIT HUP INT TERM

security find-generic-password -s app.hanami.translator.openai -a default -w | (
  IFS= read -r diagnostic_api_key
  curl -sS \
    -D "$diagnostic_header_path" \
    -o "$diagnostic_response_path" \
    -w 'HTTP %{http_code}\n' \
    -X POST "$diagnostic_api_base/images/edits" \
    -H "Authorization: Bearer $diagnostic_api_key" \
    -F 'model=gpt-image-2' \
    -F "image[]=@$diagnostic_image_path;type=image/png" \
    -F 'quality=medium' \
    -F 'size=auto' \
    -F 'prompt=Translate all readable English text on this document page into Simplified Chinese. Preserve layout and all non-text details.'
)

if jq -e . "$diagnostic_response_path" >/dev/null 2>&1; then
  jq -c '
    if .error then
      {error: {message: .error.message, type: .error.type, param: .error.param, code: .error.code}}
    else
      {data_count: (.data | length), has_image: (.data[0].b64_json != null)}
    end
  ' "$diagnostic_response_path"
else
  grep -i '^content-type:' "$diagnostic_header_path" | tail -n 1
  wc -c "$diagnostic_response_path"
  LC_ALL=C head -c 240 "$diagnostic_response_path"
  printf '\n'
fi
