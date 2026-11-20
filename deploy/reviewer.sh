#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# keep container paths intact under git bash.
export MSYS_NO_PATHCONV=1
project=${RUNLINE_REVIEWER_PROJECT:-runline-reviewer}
[[ $project =~ ^runline-reviewer(-[a-z0-9]+)*$ ]] || { echo "Use a runline-reviewer project name." >&2; exit 1; }
private=.local/reviewer
settings="$private/$project.env"
env_file=$settings

compose() {
  docker compose --project-name "$project" --env-file "$env_file" -f compose.yaml -f compose.reviewer.yaml "$@"
}

initialize() {
  local host=$1
  [[ $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo "Provide a hostname without a scheme or port." >&2; return 1; }
  if [[ -e $settings ]]; then
    echo "Reviewer settings already exist for $project." >&2
    return 1
  fi
  {
    printf 'RUNLINE_REVIEWER_HOST=%s\n' "$host"
    printf 'RUNLINE_DATASET_ID=%s\n' "$(openssl rand -hex 8)"
    for key in RUNLINE_SESSION_SECRET RUNLINE_DB_PASSWORD RUNLINE_APP_PASSWORD RUNLINE_DOCUMENTS_PASSWORD RUNLINE_S3_SECRET_KEY; do
      printf '%s=%s\n' "$key" "$(openssl rand -hex 32)"
    done
    printf 'RUNLINE_S3_ACCESS_KEY=%s\n' "$(openssl rand -hex 16)"
  } > "$settings"
  echo "Reviewer settings are ready."
}

archive_volume() {
  local service=$1 mount=$2 action=$3
  shift 3
  compose run --rm --no-deps -T --entrypoint tar "$service" -C "$mount" "$action" - "$@"
}

backup() (
  local dir
  mkdir -p "$private/backups/$project"
  dir=$(mktemp -d "$private/backups/$project/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  trap 'compose up -d --wait --wait-timeout 180' EXIT
  compose stop caddy web api worker
  compose stop db redis storage
  archive_volume db /var/lib/postgresql/data -czf . > "$dir/postgres.tar.gz"
  archive_volume storage /data -czf . > "$dir/documents.tar.gz"
  archive_volume redis /data -czf . > "$dir/redis.tar.gz"
  (cd "$dir" && sha256sum postgres.tar.gz documents.tar.gz redis.tar.gz > SHA256SUMS)
  compose up -d --wait --wait-timeout 180
  trap - EXIT
  printf 'Backup saved to %s\n' "$dir"
)

switch_dataset() (
  local backup_dir=${1:-} candidate dataset
  if [[ -n $backup_dir ]]; then
    (cd "$backup_dir" && sha256sum --check --status SHA256SUMS)
    for archive in postgres documents redis; do
      tar -tzf "$backup_dir/$archive.tar.gz" > /dev/null
    done
  fi

  dataset=$(openssl rand -hex 8)
  candidate=$(mktemp "$private/$project.XXXXXX")
  sed "s/^RUNLINE_DATASET_ID=.*/RUNLINE_DATASET_ID=$dataset/" "$settings" > "$candidate"
  trap 'status=$?; trap - EXIT; set +e; compose down; env_file=$settings; compose up -d --wait --wait-timeout 180; rm -f -- "$candidate"; exit "$status"' EXIT
  compose down
  env_file=$candidate
  if [[ -n $backup_dir ]]; then
    archive_volume db /var/lib/postgresql/data -xzpf < "$backup_dir/postgres.tar.gz"
    archive_volume storage /data -xzpf < "$backup_dir/documents.tar.gz"
    archive_volume redis /data -xzpf < "$backup_dir/redis.tar.gz"
  fi
  compose up -d --wait --wait-timeout 180
  mv -f -- "$candidate" "$settings"
  trap - EXIT
  echo "Reviewer dataset $dataset is active."
)

case "${1:-}" in
  init) [[ $# -eq 2 ]] || { echo "Usage: $0 init <hostname>" >&2; exit 1; } ;;
  up|backup|reset) [[ $# -eq 1 ]] || { echo "Usage: $0 $1" >&2; exit 1; } ;;
  restore) [[ $# -eq 2 && -f $2/SHA256SUMS ]] || { echo "Usage: $0 restore <backup-directory>" >&2; exit 1; } ;;
  *) echo "Usage: $0 {init <hostname>|up|backup|reset|restore <backup-directory>}" >&2; exit 1 ;;
esac

mkdir -p "$private"
lock="$private/$project.lock"
mkdir "$lock" 2>/dev/null || { echo "Another reviewer operation holds $lock." >&2; exit 1; }
trap 'rmdir "$lock"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ $1 != init ]]; then
  [[ -f $settings ]] || { echo "Initialize $project first." >&2; exit 1; }
  # use the generated credentials and dataset even if the shell has old settings.
  unset RUNLINE_DATASET_ID RUNLINE_SESSION_SECRET RUNLINE_REVIEWER_HOST RUNLINE_DB_PASSWORD \
    RUNLINE_APP_PASSWORD RUNLINE_DOCUMENTS_PASSWORD RUNLINE_S3_ACCESS_KEY RUNLINE_S3_SECRET_KEY
fi

case "$1" in
  init) initialize "$2" ;;
  up) compose up -d --build --wait --wait-timeout 180 ;;
  backup) backup ;;
  reset) switch_dataset ;;
  restore) switch_dataset "$2" ;;
esac
