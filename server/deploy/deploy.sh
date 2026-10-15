#!/usr/bin/env bash
# Runs ON the droplet, piped over SSH by .github/workflows/deploy.yml:
#   ssh root@droplet 'bash -s -- <sha>' < server/deploy/deploy.sh
# Everything lives in main() so a command that reads stdin cannot eat the rest of the script.
set -euo pipefail

main() {
  local sha="$1"
  local image=ghcr.io/collabo-digital/crm-api
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

  # Make the checkout an exact mirror of the deployed commit.
  # server/.env is untracked, so it is not touched.
  cd /opt/crm
  git fetch --quiet origin production
  git reset --hard "$sha"
  cd server

  # Remember what is running now, for rollback.
  local prev
  prev=$(docker inspect -f '{{.Image}}' collabo-api 2>/dev/null || true)

  # Pull the exact sha, then point the :production tag at it locally.
  docker pull --quiet "$image:$sha"
  docker tag "$image:$sha" "$image:production"
  docker compose up -d --no-build api

  # Wait up to 180 s for the healthcheck (wget /api/v1 every 30 s, 40 s start period).
  local status=starting
  for _ in $(seq 1 36); do
    sleep 5
    status=$(docker inspect -f '{{.State.Health.Status}}' collabo-api 2>/dev/null || echo missing)
    [ "$status" = healthy ] && break
  done

  if [ "$status" != healthy ]; then
    echo "::error::collabo-api is '$status' after 180s, rolling back to the previous image"
    docker logs --tail 80 collabo-api || true
    if [ -n "$prev" ]; then
      docker tag "$prev" "$image:production"
      docker compose up -d --no-build api
    fi
    exit 1
  fi

  # The droplet never builds any more: drop older deploys and the leftover build cache.
  docker images "$image" --format '{{.ID}} {{.Tag}}' \
    | awk -v keep="$sha" '$2 != keep && $2 != "production" { print $1 }' \
    | sort -u | xargs -r docker rmi >/dev/null 2>&1 || true
  docker image prune -f >/dev/null
  docker builder prune -af >/dev/null

  echo "Deployed $sha"
}

main "$@"
