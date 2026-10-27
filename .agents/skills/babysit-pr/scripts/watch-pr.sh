#!/usr/bin/env bash
# Watch pull requests and print one line per thing an agent must act on.
#
# Usage: watch-pr.sh [--until-event] [--interval SECS] [--quiet SECS] PR...
#   PR is a pull request URL, or a number resolved against the current repo.
#   Pass URLs for PRs opened from a fork.
#
# Output, one line per event on stdout (diagnostics go to stderr):
#   COMMENT|INLINE|REVIEW <pr> <id> <author> [path:line] [(edited)]: <snippet>
#   CHECKS-FAILED <pr> <head>: <check names>    once per head commit
#   CONFLICT <pr> <head>                         once per head commit
#   SETTLED <pr> <head> checks=<n>               all checks done and nothing new for --quiet secs
#   CLOSED <pr> MERGED|CLOSED
#   ERROR <pr>: <message>                        after 3 failed polls in a row
#
# The first poll of a PR records what already exists and prints nothing, so read
# the PR once yourself before starting. Your own comments are never reported.
# State lives in $BABYSIT_STATE (default ~/.cache/babysit-pr), so a restarted
# watcher does not repeat events. Exits 0 once every PR is settled or closed.
# --until-event exits after the first poll that printed events, for harnesses
# that block on a command instead of streaming its output.
#
# Needs only gh. Do not add jq: it is not installed everywhere.

set -u

interval=60
quiet=300
until_event=0
prs=()
while [ $# -gt 0 ]; do
  case "$1" in
    --until-event) until_event=1 ;;
    --interval) interval="$2"; shift ;;
    --quiet) quiet="$2"; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) prs+=("$1") ;;
  esac
  shift
done
[ ${#prs[@]} -gt 0 ] || { echo "usage: watch-pr.sh [--until-event] [--interval SECS] [--quiet SECS] PR..." >&2; exit 2; }

state="${BABYSIT_STATE:-$HOME/.cache/babysit-pr}"
mkdir -p "$state"
me=$(gh api user --jq .login) || { echo "gh is not authenticated" >&2; exit 2; }

# Strips HTML comments and tags from bot bodies, then keeps a one-line preview.
snip='def snip: (.body // "") | gsub("(?s)<!--.*?-->"; "") | gsub("<[^>]*>"; "") | gsub("\\s+"; " ") | ltrimstr(" ") | .[0:200];'

# A check name counts once. It is pending if any run is unfinished, and failed only
# if no run of it succeeded, so cancelled duplicates of a passing check are ignored.
checks='. as $pr | [.statusCheckRollup[] | (.conclusion // .state // "") as $r | {
  n: (.name // .context),
  p: (((.status // "COMPLETED") != "COMPLETED") or $r == "PENDING" or $r == "EXPECTED"),
  f: ($r | test("^(FAILURE|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE|ERROR)$")),
  ok: ($r | test("^(SUCCESS|NEUTRAL|SKIPPED)$"))
}] | group_by(.n) as $g
| "\($pr.state)\t\($pr.headRefOid)\t\($pr.mergeable)\t\($g | length)\t\([$g[] | select(any(.p))] | length)\t\([$g[] | select(any(.f) and (any(.ok) | not) and (any(.p) | not)) | .[0].n] | join(", "))"'

get() { cat "$1" 2>/dev/null; }

# Polls one PR and prints its events. Per-PR state is kept in files because each
# call runs in a subshell.
poll() {
  local url="$1" repo n base view err rc
  repo=$(echo "$url" | sed -E 's#https://github.com/([^/]+/[^/]+)/pull/.*#\1#')
  n="${url##*/}"
  base="$state/$(echo "$repo" | tr / _)_$n"
  err="$base.err"

  view=$(gh pr view "$url" --json state,headRefOid,mergeable,statusCheckRollup --jq "$checks" 2>"$err") || {
    rc=$(( $(get "$base.errs" || echo 0) + 1 )); echo "$rc" > "$base.errs"
    [ "$rc" -eq 3 ] && echo "ERROR #$n: $(head -1 "$err")"
    return
  }
  local items
  items=$( {
    gh api --paginate "repos/$repo/issues/$n/comments?per_page=100" --jq "$snip"' .[] | select(.user.login != "'"$me"'") | "c\t\(.id)\t\(.updated_at)\tCOMMENT #'"$n"' \(.id) \(.user.login)\t\(snip)"' &&
    gh api --paginate "repos/$repo/pulls/$n/comments?per_page=100" --jq "$snip"' .[] | select(.user.login != "'"$me"'") | "i\t\(.id)\t\(.updated_at)\tINLINE #'"$n"' \(.id) \(.user.login) \(.path):\(.line // .original_line)\t\(snip)"' &&
    gh api --paginate "repos/$repo/pulls/$n/reviews?per_page=100" --jq "$snip"' .[] | select(.user.login != "'"$me"'" and ((.body // "") | length) > 0) | "r\t\(.id)\t\(.state)\tREVIEW #'"$n"' \(.id) \(.user.login) \(.state)\t\(snip)"'
  } 2>"$err") || {
    rc=$(( $(get "$base.errs" || echo 0) + 1 )); echo "$rc" > "$base.errs"
    [ "$rc" -eq 3 ] && echo "ERROR #$n: $(head -1 "$err")"
    return
  }
  echo 0 > "$base.errs"

  local pr_state head mergeable total pending failed now seeded=1
  IFS=$'\t' read -r pr_state head mergeable total pending failed <<< "$view"
  now=$(date +%s)
  [ -f "$base.seen" ] || { seeded=0; : > "$base.seen"; }

  if [ "$(get "$base.head")" != "$head" ]; then
    echo "$head" > "$base.head"
    echo "$now" > "$base.active"
  fi

  local kind id stamp label text key
  while IFS=$'\t' read -r kind id stamp label text; do
    [ -n "$kind" ] || continue
    key="$kind$id@$stamp"
    grep -qxF "$key" "$base.seen" && continue
    if [ "$seeded" -eq 1 ]; then
      if grep -q "^$kind$id@" "$base.seen"; then echo "$label (edited): $text"; else echo "$label: $text"; fi
      echo "$now" > "$base.active"
    fi
    echo "$key" >> "$base.seen"
  done <<< "$items"

  if [ "$pr_state" != "OPEN" ]; then echo "CLOSED #$n $pr_state"; return; fi
  if [ -n "$failed" ] && [ "$(get "$base.failed")" != "$head" ]; then
    echo "$head" > "$base.failed"
    echo "CHECKS-FAILED #$n ${head:0:9}: $failed"
  fi
  if [ "$mergeable" = "CONFLICTING" ] && [ "$(get "$base.conflict")" != "$head" ]; then
    echo "$head" > "$base.conflict"
    echo "CONFLICT #$n ${head:0:9}"
  fi
  # A PR without any checks settles after twice the quiet period.
  local idle=$(( now - $(get "$base.active" || echo "$now") ))
  if { [ "$total" -gt 0 ] && [ "$pending" -eq 0 ] && [ "$idle" -ge "$quiet" ]; } ||
     { [ "$total" -eq 0 ] && [ "$idle" -ge $(( quiet * 2 )) ]; }; then
    echo "SETTLED #$n ${head:0:9} checks=$total failed=${failed:-none}"
  fi
}

urls=()
for pr in "${prs[@]}"; do
  url=$(gh pr view "$pr" --json url --jq .url) || { echo "cannot resolve PR: $pr" >&2; exit 2; }
  urls+=("$url")
done

while :; do
  active=()
  printed=0
  for url in "${urls[@]}"; do
    out=$(poll "$url")
    if [ -n "$out" ]; then
      printed=1
      echo "$out"
    fi
    echo "$out" | grep -qE '^(SETTLED|CLOSED) ' || active+=("$url")
  done
  [ ${#active[@]} -gt 0 ] || exit 0
  urls=("${active[@]}")
  [ "$until_event" -eq 1 ] && [ "$printed" -eq 1 ] && exit 0
  sleep "$interval"
done
