#!/usr/bin/env bash
set -euo pipefail

label="ci-command"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      label="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "usage: run-with-retry.sh [--label name] -- command [args...]" >&2
  exit 2
fi

attempts="${CI_RETRY_ATTEMPTS:-2}"
delay_seconds="${CI_RETRY_DELAY_SECONDS:-10}"
log_dir="${CI_RETRY_LOG_DIR:-${RUNNER_TEMP:-/tmp}/openclaw-ci-retry}"
mkdir -p "$log_dir"

if ! [[ "$attempts" =~ ^[0-9]+$ ]] || [[ "$attempts" -lt 1 ]]; then
  echo "CI_RETRY_ATTEMPTS must be a positive integer" >&2
  exit 2
fi

exit_code=0
for attempt in $(seq 1 "$attempts"); do
  log_file="$log_dir/${label}-attempt-${attempt}.log"
  echo "::group::${label} attempt ${attempt}/${attempts}"
  set +e
  "$@" 2>&1 | tee "$log_file"
  exit_code=${PIPESTATUS[0]}
  set -e
  echo "::endgroup::"

  if [[ "$exit_code" -eq 0 ]]; then
    if [[ "$attempt" -gt 1 ]]; then
      echo "::warning title=${label} recovered after retry::attempt ${attempt}/${attempts} passed"
    fi
    exit 0
  fi

  echo "::warning title=${label} failed::attempt ${attempt}/${attempts} exited with ${exit_code}; log: ${log_file}"
  if [[ "$attempt" -lt "$attempts" ]]; then
    sleep "$delay_seconds"
  fi
done

echo "::error title=${label} failed after retries::${attempts} attempt(s) failed"
exit "$exit_code"
