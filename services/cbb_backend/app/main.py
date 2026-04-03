from __future__ import annotations

import asyncio
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Query

try:
    from pymongo import MongoClient
except Exception:  # pragma: no cover
    MongoClient = None

try:
    from playwright.async_api import async_playwright
except Exception:  # pragma: no cover
    async_playwright = None


app = FastAPI(title="Composite CBB Backend", version="0.2.0")

SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball"
HTTP_TIMEOUT = 35.0
SNAPSHOT_TTL_MINUTES = 60
MEMORY_STORE: dict[str, dict[str, Any]] = {}

TEAM_ALIASES = {
    "uconn": "connecticut",
    "olemiss": "mississippi",
    "missst": "mississippistate",
    "unc": "northcarolina",
    "smu": "southernmethodist",
    "byu": "brighamyoung",
    "ucf": "centralflorida",
    "lsu": "louisianastate",
    "cal": "california",
    "usu": "utahstate",
    "ncstate": "northcarolinastate",
    "vcu": "virginiacommonwealth",
    "tcu": "texaschristian",
    "uab": "alabamabirmingham",
    "ucirvine": "californiairvine",
    "ucsandiego": "californiasandiego",
    "ucdavis": "californiadavis",
    "ucsb": "californiasantabarbara",
    "stjohns": "stjohns",
    "saintjohns": "stjohns",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def round_value(value: float | int | None, digits: int = 1) -> float | None:
    if value is None:
        return None
    factor = 10 ** digits
    return round(float(value) * factor) / factor


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def weighted_average(pairs: list[tuple[float | int | None, float]]) -> float | None:
    usable = [(float(value), float(weight)) for value, weight in pairs if value is not None and weight > 0]
    if not usable:
        return None
    total_weight = sum(weight for _value, weight in usable)
    if not total_weight:
        return None
    return round_value(sum(value * weight for value, weight in usable) / total_weight, 2)


def mongo_collection():
    uri = os.getenv("MONGODB_URI", "").strip()
    if not uri or MongoClient is None:
        return None
    client = MongoClient(uri)
    db_name = os.getenv("CBB_MONGO_DB", "composite_cbb")
    coll_name = os.getenv("CBB_MONGO_COLLECTION", "snapshots")
    return client[db_name][coll_name]


def read_cached_snapshot(kind: str) -> dict[str, Any] | None:
    collection = mongo_collection()
    if collection is not None:
      doc = collection.find_one({"kind": kind}, sort=[("updatedAt", -1)])
      if doc:
        return doc.get("payload")
    return MEMORY_STORE.get(kind, {}).get("payload")


def write_cached_snapshot(kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    entry = {"payload": payload, "updatedAt": utc_now()}
    collection = mongo_collection()
    if collection is not None:
      collection.replace_one({"kind": kind}, {"kind": kind, **entry}, upsert=True)
    MEMORY_STORE[kind] = entry
    return payload


def snapshot_fresh(payload: dict[str, Any] | None, ttl_minutes: int = SNAPSHOT_TTL_MINUTES) -> bool:
    if not payload or not payload.get("lastUpdated"):
        return False
    try:
        updated = datetime.fromisoformat(payload["lastUpdated"].replace("Z", "+00:00"))
    except Exception:
        return False
    return datetime.now(timezone.utc) - updated <= timedelta(minutes=ttl_minutes)


async def fetch_json(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        response = await client.get(url, headers={"Accept": "application/json"})
        response.raise_for_status()
        return response.json()


async def fetch_text(url: str) -> str:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        response = await client.get(
            url,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
            },
        )
        response.raise_for_status()
        return response.text


def make_team_lookup(teams: list[dict[str, Any]]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for team in teams:
        keys = {
            normalize_key(team.get("displayName")),
            normalize_key(team.get("shortDisplayName")),
            normalize_key(team.get("abbreviation")),
            normalize_key(team.get("location")),
        }
        for key in keys:
            if not key:
                continue
            lookup[key] = team["id"]
            if key in TEAM_ALIASES:
                lookup[normalize_key(TEAM_ALIASES[key])] = team["id"]
    return lookup


def resolve_team_id(team_lookup: dict[str, str], name: str = "", abbr: str = "") -> str | None:
    candidates = [
        normalize_key(name),
        normalize_key(re.sub(r"\bsaint\b", "st", name, flags=re.I)),
        normalize_key(re.sub(r"\bst\.$", "state", name, flags=re.I)),
        normalize_key(abbr),
    ]
    for key in candidates:
        if key and key in team_lookup:
            return team_lookup[key]
    return None


def flatten_stats(stats: list[dict[str, Any]] | None) -> dict[str, Any]:
    mapping: dict[str, Any] = {}
    for stat in stats or []:
        for key in [stat.get("name"), stat.get("displayName"), stat.get("shortDisplayName"), stat.get("abbreviation")]:
            if not key:
                continue
            mapping[normalize_key(key)] = stat.get("value") or stat.get("displayValue") or 0
    return mapping


def stat_value(stats: dict[str, Any], keys: list[str], fallback: float = 0) -> float:
    for key in keys:
        value = stats.get(normalize_key(key))
        try:
            numeric = float(value)
            return numeric
        except Exception:
            continue
    return fallback


def parse_team(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id")),
        "espnId": str(raw.get("id")),
        "abbreviation": raw.get("abbreviation") or raw.get("shortDisplayName") or raw.get("displayName"),
        "displayName": raw.get("displayName") or raw.get("name"),
        "shortDisplayName": raw.get("shortDisplayName") or raw.get("abbreviation") or raw.get("displayName"),
        "logo": raw.get("logo") or (raw.get("logos") or [{}])[0].get("href", ""),
        "color": raw.get("color") or "#d28c2f",
        "alternateColor": raw.get("alternateColor") or "#fff1c8",
        "location": raw.get("location") or "",
    }


def walk(node: Any, visit):
    if node is None:
        return
    if isinstance(node, dict):
        visit(node)
        for value in node.values():
            walk(value, visit)
    elif isinstance(node, list):
        for value in node:
            walk(value, visit)


async def get_espn_teams() -> list[dict[str, Any]]:
    payloads = await asyncio.gather(
        fetch_json(f"{SITE}/teams?limit=500"),
        fetch_json(f"{SITE}/teams"),
        fetch_json(f"{SITE}/standings"),
        return_exceptions=True,
    )
    teams: dict[str, dict[str, Any]] = {}
    for payload in payloads:
        if isinstance(payload, Exception):
            continue
        def visit(node):
            if node.get("team", {}).get("id"):
                team = parse_team(node["team"])
                teams[team["id"]] = team
            elif node.get("id") and node.get("displayName") and node.get("abbreviation") and not node.get("position"):
                team = parse_team(node)
                teams[team["id"]] = team
        walk(payload, visit)
    if not teams:
        raise RuntimeError("Unable to load ESPN CBB team universe")
    return list(teams.values())


async def get_espn_standings() -> list[dict[str, Any]]:
    payload = await fetch_json(f"{SITE}/standings")
    entries: list[dict[str, Any]] = []

    def visit(node):
        if node.get("team", {}).get("id") and isinstance(node.get("stats"), list):
            entries.append(node)

    walk(payload, visit)
    standings = []
    for entry in entries:
        stats = flatten_stats(entry.get("stats"))
        wins = stat_value(stats, ["wins"], 0)
        losses = stat_value(stats, ["losses"], 0)
        games_played = stat_value(stats, ["gamesplayed", "games"], wins + losses)
        standings.append(
            {
                "teamId": str(entry["team"]["id"]),
                "wins": wins,
                "losses": losses,
                "gamesPlayed": games_played,
                "record": stats.get("recorddisplay") or f"{int(wins)}-{int(losses)}",
                "winPct": wins / games_played if games_played else 0,
                "conference": entry.get("group", {}).get("shortName") or entry.get("group", {}).get("name") or "Division I",
            }
        )
    return standings


async def get_team_statistics(team_id: str) -> dict[str, Any]:
    payload = await fetch_json(f"{SITE}/teams/{team_id}/statistics")
    stats: dict[str, Any] = {}

    def visit(node):
        if isinstance(node.get("stats"), list):
            stats.update(flatten_stats(node["stats"]))

    walk(payload, visit)
    return stats


async def get_team_schedule(team_id: str) -> dict[str, Any]:
    try:
        return await fetch_json(f"{SITE}/teams/{team_id}/schedule")
    except Exception:
        return {"events": []}


def summarize_recent_form(schedule_payload: dict[str, Any], team_id: str) -> dict[str, Any]:
    events = schedule_payload.get("events") or schedule_payload.get("games") or []
    completed = [event for event in events if (((event.get("competitions") or [{}])[0].get("status") or {}).get("type") or {}).get("state") == "post"][-5:]
    wins = 0
    points = 0
    results: list[dict[str, Any]] = []
    outcomes: list[str] = []
    for event in reversed(completed):
        comp = (event.get("competitions") or [{}])[0]
        competitors = comp.get("competitors") or []
        team = next((item for item in competitors if str(item.get("team", {}).get("id")) == str(team_id)), None)
        opp = next((item for item in competitors if str(item.get("team", {}).get("id")) != str(team_id)), None)
        if not team or not opp:
            continue
        team_score = int(team.get("score") or 0)
        opp_score = int(opp.get("score") or 0)
        result = "W" if team_score > opp_score else "L"
        if result == "W":
            wins += 1
            points += 2
        outcomes.append(result)
        results.append(
            {
                "date": event.get("date"),
                "result": result,
                "opponentName": opp.get("team", {}).get("displayName") or opp.get("team", {}).get("shortDisplayName") or "Opponent",
                "score": f"{team_score}-{opp_score}",
            }
        )
    streak_value = 0
    streak_label = "Even"
    if outcomes:
        first = outcomes[0]
        count = 1
        while count < len(outcomes) and outcomes[count] == first:
            count += 1
        streak_label = f"{first}{count}"
        streak_value = count if first == "W" else -count
    return {
        "recent": results,
        "recentFormPoints": points,
        "streak": streak_label,
        "streakValue": streak_value,
    }


async def fetch_polls() -> dict[str, Any]:
    payload = await fetch_json(f"{SITE}/rankings")
    polls: list[dict[str, Any]] = []

    def visit(node):
        if node.get("id") and isinstance(node.get("ranks"), list) and (node.get("displayName") or node.get("name")):
            polls.append(node)

    walk(payload, visit)
    ap = next((item for item in polls if re.search(r"associated press|ap", (item.get("displayName") or item.get("name") or ""), re.I)), None)
    coaches = next((item for item in polls if re.search(r"coaches", (item.get("displayName") or item.get("name") or ""), re.I)), None)
    poll = ap or coaches
    rank_map: dict[str, int] = {}
    if poll:
        for entry in poll.get("ranks") or []:
            team_id = str(entry.get("team", {}).get("id") or entry.get("teamId") or "")
            if team_id:
                rank_map[team_id] = int(entry.get("current") or entry.get("rank") or len(rank_map) + 1)
    return {
        "label": (poll or {}).get("displayName") or (poll or {}).get("name") or "Poll unavailable",
        "isFallback": bool(poll and coaches and poll is coaches and ap is None),
        "rankMap": rank_map,
    }


async def fetch_net_rankings(teams: list[dict[str, Any]]) -> list[dict[str, Any]]:
    html = await fetch_text("https://www.ncaa.com/rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings")
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table.sticky")
    lookup = make_team_lookup(teams)
    entries: list[dict[str, Any]] = []
    for row in table.select("tbody tr") if table else []:
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["td", "th"])]
        if len(cells) < 2:
            continue
        try:
            rank = int(cells[0])
        except Exception:
            continue
        team_id = resolve_team_id(lookup, cells[1], "")
        if not team_id:
            continue
        entries.append({"teamId": team_id, "rank": rank, "teamName": cells[1], "record": cells[2] if len(cells) > 2 else ""})
    return entries


async def fetch_haslametrics(teams: list[dict[str, Any]]) -> list[dict[str, Any]]:
    xml = await fetch_text("https://haslametrics.com/ratings.xml")
    soup = BeautifulSoup(xml, "xml")
    lookup = make_team_lookup(teams)
    entries: list[dict[str, Any]] = []
    for row in soup.find_all("mr"):
        try:
            rank = int(row.get("rk") or 0)
        except Exception:
            continue
        team_id = resolve_team_id(lookup, row.get("t") or "", row.get("abbr") or "")
        if not team_id:
            continue
        entries.append(
            {
                "teamId": team_id,
                "rank": rank,
                "offenseValue": float(row.get("oe") or 0),
                "defenseValue": float(row.get("de") or 0),
                "teamName": row.get("t") or "",
            }
        )
    return entries


def parse_generic_source_table(html: str, teams: list[dict[str, Any]], source_name: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    lookup = make_team_lookup(teams)
    best_rows: list[dict[str, Any]] = []

    for table in tables:
        header_cells = [cell.get_text(" ", strip=True) for cell in table.select("thead th")]
        body_rows = table.select("tbody tr")
        if len(body_rows) < 25:
            continue
        header_map = {normalize_key(name): index for index, name in enumerate(header_cells)}
        rank_index = next((index for key, index in header_map.items() if key in {"rk", "rank", "ratingrank"}), 0)
        team_index = next((index for key, index in header_map.items() if key in {"team", "school"}), 1)
        off_index = next((index for key, index in header_map.items() if any(token in key for token in ["adjo", "off", "orating", "offeff"])), None)
        def_index = next((index for key, index in header_map.items() if any(token in key for token in ["adjd", "def", "drating", "defeff"])), None)
        lower_is_better_def = source_name != "evanmiya"

        rows: list[dict[str, Any]] = []
        for tr in body_rows:
            cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["td", "th"])]
            if len(cells) <= max(rank_index, team_index):
                continue
            try:
                rank = int(re.sub(r"[^0-9]", "", cells[rank_index]))
            except Exception:
                continue
            team_name = cells[team_index]
            team_id = resolve_team_id(lookup, team_name, "")
            if not team_id:
                continue
            def numeric(index):
                if index is None or index >= len(cells):
                    return None
                match = re.search(r"-?\d+(\.\d+)?", cells[index])
                return float(match.group(0)) if match else None
            rows.append(
                {
                    "teamId": team_id,
                    "rank": rank,
                    "teamName": team_name,
                    "offenseValue": numeric(off_index),
                    "defenseValue": numeric(def_index),
                    "lowerDefIsBetter": lower_is_better_def,
                }
            )
        if len(rows) > len(best_rows):
            best_rows = rows
    return best_rows


async def scrape_playwright_source(url: str, teams: list[dict[str, Any]], source_name: str) -> list[dict[str, Any]]:
    if async_playwright is None:
        return []
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=90_000)
            if "Verifying Browser" in (await page.content()):
                form = page.locator("form[name='js_test']")
                if await form.count():
                    await form.evaluate("form => form.submit()")
                    await page.wait_for_load_state("networkidle", timeout=90_000)
            await page.wait_for_timeout(2500)
            html = await page.content()
            await browser.close()
        return parse_generic_source_table(html, teams, source_name)
    except Exception:
        return []


def average_available(values: list[float | int | None]) -> float | None:
    usable = [float(value) for value in values if value is not None]
    if not usable:
        return None
    return round_value(sum(usable) / len(usable), 2)


def assign_unranked_ap(rows: list[dict[str, Any]], poll_rank_map: dict[str, int]):
    if not poll_rank_map:
        for row in rows:
            row["apRank"] = None
        return
    ordered = sorted(rows, key=lambda row: (row.get("netRank") or 999, row.get("haslametricsRank") or 999, -(row.get("hotness") or 0)))
    unranked = [row for row in ordered if row["id"] not in poll_rank_map]
    total = max(1, len(unranked))
    for row in rows:
        if row["id"] in poll_rank_map:
            row["apRank"] = poll_rank_map[row["id"]]
            continue
        idx = next((index for index, item in enumerate(unranked) if item["id"] == row["id"]), 0)
        percentile = (idx + 1) / (total + 1)
        row["apRank"] = round_value(25 + percentile * 340, 1)


def build_player_rating(player: dict[str, Any], team: dict[str, Any]) -> float:
    stats = player.get("stats") or {}
    position = (player.get("position") or "").upper()
    bucket = "big" if "C" in position else "wing" if "F" in position else "guard"
    points = float(stats.get("points") or 0)
    rebounds = float(stats.get("rebounds") or 0)
    assists = float(stats.get("assists") or 0)
    steals = float(stats.get("steals") or 0)
    blocks = float(stats.get("blocks") or 0)
    turnovers = float(stats.get("turnovers") or 0)
    minutes = float(stats.get("minutes") or 0)
    fg_pct = float(stats.get("fgPct") or 42)
    three_pct = float(stats.get("threePct") or 31)
    leaders = player.get("leaders") or []
    team_boost = clamp(10 - ((team.get("compositeRank") or 180) / 28), -3, 4)
    hotness = clamp((float(team.get("hotness") or 50) - 50) * 0.04, -2, 2.5)
    usage_rate = (points + assists * 1.35 + rebounds * 0.65) / max(1.0, minutes) if minutes > 0 else 0
    efficiency_boost = clamp((fg_pct - 43) * 0.24 + (three_pct - 32) * 0.18, -4, 5)
    roster_slot = clamp(9 - float(player.get("rosterOrder") or 14) * 0.72, -5, 5)
    stat_reliability = clamp(
        (minutes / 24) * 0.55 +
        (points / 16) * 0.2 +
        ((rebounds + assists + steals + blocks) / 12) * 0.15 +
        (0.1 if leaders else 0),
        0.1,
        1,
    )
    class_year = str(player.get("classYear") or "")
    class_boost = 1 if re.search(r"sr|senior", class_year, re.I) else 0.7 if re.search(r"jr|junior", class_year, re.I) else 0.35 if re.search(r"so|sophomore", class_year, re.I) else 0.1
    if bucket == "guard":
        production = points * 1.85 + assists * 3 + steals * 2.3 + minutes * 0.26 + three_pct * 0.11 + fg_pct * 0.08 - turnovers * 1.25 + usage_rate * 9
    elif bucket == "wing":
        production = points * 1.75 + rebounds * 1.7 + assists * 1.8 + steals * 1.8 + blocks * 1.5 + minutes * 0.24 + fg_pct * 0.08 - turnovers * 1.08 + usage_rate * 8
    else:
        production = points * 1.55 + rebounds * 2.55 + blocks * 3.1 + assists * 1.1 + minutes * 0.24 + fg_pct * 0.1 - turnovers * 0.92 + usage_rate * 7
    leader_boost = sum(max(0, 18 - int(item.get("rank") or 18)) * 0.85 for item in leaders[:3])
    stat_presence = (2.2 if points > 0 else -2) + (1.2 if assists > 0 else 0) + (1.2 if rebounds > 0 else 0) + (3 if minutes >= 12 else 1 if minutes > 0 else -4) + (0.8 if fg_pct > 0 else 0)
    return round_value((production * stat_reliability) + leader_boost + team_boost + hotness + efficiency_boost + roster_slot + class_boost + stat_presence, 3) or 42.0


async def build_bootstrap_snapshot() -> dict[str, Any]:
    teams, standings, polls = await asyncio.gather(get_espn_teams(), get_espn_standings(), fetch_polls())
    net_rows, haslam_rows, scoreboard_payload = await asyncio.gather(
        fetch_net_rankings(teams),
        fetch_haslametrics(teams),
        fetch_json(f"{SITE}/scoreboard?groups=50"),
    )
    torvik_rows, kenpom_rows, evan_rows = await asyncio.gather(
        scrape_playwright_source("https://barttorvik.com/trank.php?year=2026", teams, "torvik"),
        scrape_playwright_source("https://kenpom.com/", teams, "kenpom"),
        scrape_playwright_source("https://evanmiya.com/", teams, "evanmiya"),
    )

    team_stats_list = await asyncio.gather(*[get_team_statistics(team["id"]) for team in teams], return_exceptions=True)
    schedules = await asyncio.gather(*[get_team_schedule(team["id"]) for team in teams], return_exceptions=True)
    standings_map = {entry["teamId"]: entry for entry in standings}
    stats_map = {team["id"]: stats for team, stats in zip(teams, team_stats_list) if not isinstance(stats, Exception)}
    schedule_map = {team["id"]: schedule for team, schedule in zip(teams, schedules) if not isinstance(schedule, Exception)}

    net_map = {entry["teamId"]: entry for entry in net_rows}
    haslam_map = {entry["teamId"]: entry for entry in haslam_rows}
    torvik_map = {entry["teamId"]: entry for entry in torvik_rows}
    kenpom_map = {entry["teamId"]: entry for entry in kenpom_rows}
    evan_map = {entry["teamId"]: entry for entry in evan_rows}

    rows: list[dict[str, Any]] = []
    for team in teams:
        standing = standings_map.get(team["id"], {})
        stats = stats_map.get(team["id"], {})
        form = summarize_recent_form(schedule_map.get(team["id"], {"events": []}), team["id"])
        ppg = stat_value(stats, ["pointspergame", "ppg"], 69)
        ppg_against = stat_value(stats, ["pointsallowedpergame", "ppa"], 69)
        fg_pct = stat_value(stats, ["fieldgoalpct", "fieldgoalpercentage"], 44)
        three_pct = stat_value(stats, ["threepointfieldgoalpct", "threepointpct"], 34)
        assists = stat_value(stats, ["assistspergame", "assists"], 12)
        turnovers = stat_value(stats, ["turnoverspergame", "turnovers"], 12)
        steals = stat_value(stats, ["stealspergame", "steals"], 6)
        blocks = stat_value(stats, ["blockspergame", "blocks"], 3)
        rebounds = stat_value(stats, ["reboundspergame", "rebounds"], 34)
        wins = standing.get("wins", 0)
        losses = standing.get("losses", 0)
        win_pct = standing.get("winPct", 0)
        net_entry = net_map.get(team["id"], {})
        standing_record = standing.get("record") or ""
        record = standing_record if standing_record and standing_record != "0-0" else (net_entry.get("record") or f"{int(wins)}-{int(losses)}")
        hotness = round_value(clamp(48 + form["recentFormPoints"] * 6 + form["streakValue"] * 4 + (win_pct - 0.5) * 40, 10, 99), 1)
        row = {
            **team,
            "conference": standing.get("conference") or "Division I",
            "record": record,
            "wins": wins,
            "losses": losses,
            "ppg": ppg,
            "ppgAgainst": ppg_against,
            "hotness": hotness,
            "trend": "Hot" if hotness >= 76 else "Rising" if hotness >= 62 else "Sliding" if hotness <= 40 else "Steady",
            "streak": form["streak"],
            "recent": form["recent"],
            "apRank": None,
            "netRank": net_entry.get("rank"),
            "torvikRank": torvik_map.get(team["id"], {}).get("rank"),
            "kenpomRank": kenpom_map.get(team["id"], {}).get("rank"),
            "haslametricsRank": haslam_map.get(team["id"], {}).get("rank"),
            "evanmiyaRank": evan_map.get(team["id"], {}).get("rank"),
            "torvikOffValue": torvik_map.get(team["id"], {}).get("offenseValue"),
            "kenpomOffValue": kenpom_map.get(team["id"], {}).get("offenseValue"),
            "haslaOffValue": haslam_map.get(team["id"], {}).get("offenseValue"),
            "evanOffValue": evan_map.get(team["id"], {}).get("offenseValue"),
            "torvikDefValue": torvik_map.get(team["id"], {}).get("defenseValue"),
            "kenpomDefValue": kenpom_map.get(team["id"], {}).get("defenseValue"),
            "haslaDefValue": haslam_map.get(team["id"], {}).get("defenseValue"),
            "evanDefValue": evan_map.get(team["id"], {}).get("defenseValue"),
            "assists": assists,
            "turnovers": turnovers,
            "rebounds": rebounds,
            "steals": steals,
            "blocks": blocks,
            "fgPct": fg_pct,
            "threePct": three_pct,
        }
        rows.append(row)

    assign_unranked_ap(rows, polls["rankMap"])

    def assign_from_value(field: str, ascending: bool = False):
        candidates = [row for row in rows if row.get(field) is not None]
        ordered = sorted(candidates, key=lambda row: row[field], reverse=not ascending)
        for index, row in enumerate(ordered, start=1):
            row[field.replace("Value", "Rank")] = index

    assign_from_value("torvikOffValue")
    assign_from_value("kenpomOffValue")
    assign_from_value("haslaOffValue")
    assign_from_value("evanOffValue")
    assign_from_value("torvikDefValue", ascending=True)
    assign_from_value("kenpomDefValue", ascending=True)
    assign_from_value("haslaDefValue", ascending=True)
    assign_from_value("evanDefValue", ascending=False)

    for row in rows:
        row["avgRank"] = weighted_average([
            (row["apRank"], 1.45),
            (row["netRank"], 1.7),
            (row["torvikRank"], 1.2),
            (row["kenpomRank"], 1.2),
            (row["haslametricsRank"], 1.25),
            (row["evanmiyaRank"], 1.2),
        ])
        row["offRank"] = weighted_average([
            (row.get("torvikOffRank"), 1.15),
            (row.get("kenpomOffRank"), 1.15),
            (row.get("haslaOffRank"), 1.3),
            (row.get("evanOffRank"), 1.15),
        ])
        row["defRank"] = weighted_average([
            (row.get("torvikDefRank"), 1.15),
            (row.get("kenpomDefRank"), 1.15),
            (row.get("haslaDefRank"), 1.3),
            (row.get("evanDefRank"), 1.15),
        ])

    rows.sort(key=lambda row: (row.get("avgRank") or 999, -(row.get("hotness") or 0)))
    for index, row in enumerate(rows, start=1):
        row["compositeRank"] = index
        row["sourceRanks"] = {
            "ap": row["apRank"],
            "net": row["netRank"],
            "torvik": row["torvikRank"],
            "kenpom": row["kenpomRank"],
            "haslametrics": row["haslametricsRank"],
            "evanmiya": row["evanmiyaRank"],
        }
        row["sourceValues"] = {
            "torvikOff": row.get("torvikOffValue"),
            "kenpomOff": row.get("kenpomOffValue"),
            "haslametricsOff": row.get("haslaOffValue"),
            "evanmiyaOff": row.get("evanOffValue"),
            "torvikDef": row.get("torvikDefValue"),
            "kenpomDef": row.get("kenpomDefValue"),
            "haslametricsDef": row.get("haslaDefValue"),
            "evanmiyaDef": row.get("evanDefValue"),
        }

    leaders_payload = await fetch_json(f"{SITE}/leaders")
    leader_map: dict[str, list[dict[str, Any]]] = {}

    def visit_leaders(node):
        if node.get("athlete", {}).get("id") and (node.get("rank") or node.get("displayValue")):
            athlete_id = str(node["athlete"]["id"])
            leader_map.setdefault(athlete_id, []).append(
                {
                    "label": node.get("name") or node.get("displayName") or "Leader",
                    "rank": int(node.get("rank") or 0) or 0,
                    "value": node.get("displayValue") or node.get("value") or "",
                }
            )

    walk(leaders_payload, visit_leaders)

    rosters_payload = await asyncio.gather(*[fetch_json(f"{SITE}/teams/{team['id']}/roster") for team in rows], return_exceptions=True)
    players: list[dict[str, Any]] = []
    roster_order = 0
    for team, payload in zip(rows, rosters_payload):
        if isinstance(payload, Exception):
            continue
        def visit_player(node):
            nonlocal roster_order
            if node.get("id") and (node.get("displayName") or node.get("fullName")) and node.get("position"):
                roster_order += 1
                stats = flatten_stats(node.get("statistics") or node.get("stats") or [])
                players.append(
                    {
                        "id": str(node["id"]),
                        "displayName": node.get("displayName") or node.get("fullName") or node.get("shortName"),
                        "shortName": node.get("shortName") or node.get("displayName"),
                        "position": (node.get("position") or {}).get("abbreviation") or "",
                        "headshot": (node.get("headshot") or {}).get("href") or f"https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/{node['id']}.png",
                        "team": {"id": team["id"], "displayName": team["displayName"], "abbreviation": team["abbreviation"], "conference": team["conference"]},
                        "classYear": (node.get("experience") or {}).get("displayValue") or "",
                        "rosterOrder": roster_order,
                        "stats": {
                            "minutes": stat_value(stats, ["minutes", "min"]),
                            "points": stat_value(stats, ["pointspergame", "points", "ppg"]),
                            "rebounds": stat_value(stats, ["reboundspergame", "rebounds", "rpg"]),
                            "assists": stat_value(stats, ["assistspergame", "assists", "apg"]),
                            "steals": stat_value(stats, ["stealspergame", "steals", "spg"]),
                            "blocks": stat_value(stats, ["blockspergame", "blocks", "bpg"]),
                            "turnovers": stat_value(stats, ["turnoverspergame", "turnovers", "topg"]),
                            "fgPct": stat_value(stats, ["fieldgoalpct", "fieldgoalpercentage"]),
                            "threePct": stat_value(stats, ["threepointfieldgoalpct", "threepointpct"]),
                        },
                        "leaders": leader_map.get(str(node["id"]), []),
                    }
                )
        walk(payload, visit_player)

    raw_scores = [build_player_rating(player, next(team for team in rows if team["id"] == player["team"]["id"])) for player in players] or [50]
    raw_min = min(raw_scores)
    raw_max = max(raw_scores)
    for player, raw in zip(players, raw_scores):
        team = next(team for team in rows if team["id"] == player["team"]["id"])
        pct = 0.5 if raw_max == raw_min else (raw - raw_min) / (raw_max - raw_min)
        stats = player.get("stats") or {}
        stat_strength = clamp(
            (float(stats.get("minutes") or 0) / 24) * 0.4 +
            (float(stats.get("points") or 0) / 18) * 0.25 +
            ((float(stats.get("rebounds") or 0) + float(stats.get("assists") or 0)) / 10) * 0.2 +
            (0.15 if player.get("leaders") else 0),
            0,
            1,
        )
        rating = round_value(clamp(46 + pct * 18 + stat_strength * 15 + clamp(8 - ((team.get("compositeRank") or 180) / 24), -2, 4) + min(4, len(player.get("leaders") or []) * 1.1), 43, 92), 1)
        player["rating"] = rating
        player["tier"] = "All-American" if rating >= 92 else "All-Conference" if rating >= 86 else "Starter" if rating >= 79 else "Rotation" if rating >= 71 else "Depth"
        player["usageSummary"] = (
            f"{round_value(player['stats']['points'], 1)} PPG • {round_value(player['stats']['assists'], 1)} APG • {round_value(player['stats']['rebounds'], 1)} RPG"
            if player["stats"]["points"] > 0
            else (f"{player['leaders'][0]['label']} #{player['leaders'][0]['rank']}" if player["leaders"] else f"{player['team']['abbreviation']} rotation")
        )
    players.sort(key=lambda player: (-player["rating"], player["displayName"]))
    for index, player in enumerate(players, start=1):
        player["rank"] = index

    events = scoreboard_payload.get("events") or []
    scoreboard = []
    ranking_record_map = {row["id"]: row["record"] for row in rows}
    for event in events:
        comp = (event.get("competitions") or [{}])[0]
        competitors = comp.get("competitors") or []
        away = next((item for item in competitors if item.get("homeAway") == "away"), {})
        home = next((item for item in competitors if item.get("homeAway") == "home"), {})
        status = (comp.get("status") or {}).get("type") or {}
        scoreboard.append(
            {
                "id": str(event.get("id")),
                "shortName": event.get("shortName") or event.get("name"),
                "state": status.get("state") or "pre",
                "statusLabel": status.get("detail") or status.get("shortDetail") or status.get("description") or "Scheduled",
                "startTime": event.get("date"),
                "home": {
                    "teamId": str(home.get("team", {}).get("id") or ""),
                    "abbreviation": home.get("team", {}).get("abbreviation") or "HOME",
                    "displayName": home.get("team", {}).get("displayName") or "Home",
                    "logo": home.get("team", {}).get("logo") or "",
                    "score": home.get("score") or "0",
                    "record": ((home.get("records") or [{}])[0]).get("summary") or ranking_record_map.get(str(home.get("team", {}).get("id") or ""), ""),
                },
                "away": {
                    "teamId": str(away.get("team", {}).get("id") or ""),
                    "abbreviation": away.get("team", {}).get("abbreviation") or "AWAY",
                    "displayName": away.get("team", {}).get("displayName") or "Away",
                    "logo": away.get("team", {}).get("logo") or "",
                    "score": away.get("score") or "0",
                    "record": ((away.get("records") or [{}])[0]).get("summary") or ranking_record_map.get(str(away.get("team", {}).get("id") or ""), ""),
                },
            }
        )

    news_payload = await fetch_json(f"{SITE}/news")
    news = []
    for index, article in enumerate((news_payload.get("articles") or [])[:12]):
        news.append(
            {
                "id": article.get("id") or f"cbb-news-{index}",
                "storyId": article.get("id") or f"cbb-news-{index}",
                "headline": article.get("headline") or "Story",
                "description": article.get("description") or "",
                "summary": article.get("description") or "",
                "published": article.get("published"),
                "image": ((article.get("images") or [{}])[0]).get("url") or "",
                "source": (article.get("source") or {}).get("name") or "ESPN",
                "body": article.get("story"),
            }
        )

    predictors = []
    ranking_map = {row["id"]: row for row in rows}
    for game in scoreboard[:16]:
        home = ranking_map.get(game["home"]["teamId"])
        away = ranking_map.get(game["away"]["teamId"])
        if not home or not away:
            continue
        home_off = home.get("offRank") or 180
        away_off = away.get("offRank") or 180
        home_def = home.get("defRank") or 180
        away_def = away.get("defRank") or 180
        home_comp = home.get("compositeRank") or 180
        away_comp = away.get("compositeRank") or 180
        home_score = round_value(71 + (home["ppg"] - away["ppgAgainst"]) * 0.42 + (100 - away_def) * 0.08 + (100 - home_off) * 0.06 + (100 - home_comp) * 0.05, 0) or 70
        away_score = round_value(71 + (away["ppg"] - home["ppgAgainst"]) * 0.42 + (100 - home_def) * 0.08 + (100 - away_off) * 0.06 + (100 - away_comp) * 0.05, 0) or 69
        home_score = int(round(home_score))
        away_score = int(round(away_score))
        if home_score == away_score:
            home_score += 1
        home_win = 55 if home_score > away_score else 45
        predictors.append(
            {
                "gameId": game["id"],
                "home": {"teamId": home["id"], "abbreviation": home["abbreviation"], "displayName": home["displayName"], "logo": home["logo"]},
                "away": {"teamId": away["id"], "abbreviation": away["abbreviation"], "displayName": away["displayName"], "logo": away["logo"]},
                "homeWinProbability": home_win,
                "awayWinProbability": 100 - home_win,
                "projectedHomeScore": int(home_score),
                "projectedAwayScore": int(away_score),
                "bettingLean": f"{home['abbreviation'] if home_score > away_score else away['abbreviation']} moneyline",
                "confidence": "High" if abs(home_score - away_score) >= 9 else "Medium" if abs(home_score - away_score) >= 5 else "Lean",
                "updatedAt": utc_now(),
            }
        )

    snapshot = {
        "sport": "cbb",
        "headline": "Composite CBB",
        "rankings": rows,
        "teams": rows,
        "topPlayers": players[:3],
        "featuredPlayers": players[:12],
        "playersCatalog": {"players": players, "totalPlayers": len(players), "lastUpdated": utc_now()},
        "scoreboard": scoreboard,
        "predictors": predictors,
        "news": news,
        "sourceState": {
            "apPoll": "live-or-coaches" if polls["rankMap"] else "missing",
            "net": "live" if len(net_rows) >= 300 else "missing",
            "torvik": "live" if len(torvik_rows) >= 300 else "missing",
            "kenpom": "live" if len(kenpom_rows) >= 300 else "missing",
            "haslametrics": "live" if len(haslam_rows) >= 300 else "missing",
            "evanmiya": "live" if len(evan_rows) >= 300 else "missing",
        },
        "sourceTimestamps": {"snapshot": utc_now()},
        "meta": {"teamCount": len(rows), "playerCount": len(players), "rankingSources": 6},
        "lastUpdated": utc_now(),
    }
    return snapshot


async def get_bootstrap(force: bool = False) -> dict[str, Any]:
    cached = None if force else read_cached_snapshot("bootstrap")
    if cached and snapshot_fresh(cached):
        return cached
    try:
        snapshot = await build_bootstrap_snapshot()
        return write_cached_snapshot("bootstrap", snapshot)
    except Exception as error:
        stale = read_cached_snapshot("bootstrap")
        if stale:
            stale["warning"] = f"Serving last-good snapshot because rebuild failed: {error}"
            return stale
        raise


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "composite-cbb",
        "timestamp": utc_now(),
        "mongoConfigured": bool(os.getenv("MONGODB_URI")),
        "playwrightAvailable": async_playwright is not None,
    }


@app.get("/bootstrap")
async def bootstrap(force: int = Query(default=0)):
    return await get_bootstrap(force=bool(force))


@app.get("/players")
async def players(q: str = Query(default="")):
    snapshot = await get_bootstrap()
    players_list = snapshot.get("playersCatalog", {}).get("players", [])
    search = q.strip().lower()
    if search:
        players_list = [
            player
            for player in players_list
            if search in " ".join(
                filter(
                    None,
                    [
                        player.get("displayName"),
                        player.get("position"),
                        player.get("team", {}).get("displayName"),
                        player.get("team", {}).get("abbreviation"),
                        player.get("team", {}).get("conference"),
                    ],
                )
            ).lower()
        ]
    return {
        "players": players_list,
        "query": search,
        "totalReturned": len(players_list),
        "lastUpdated": snapshot.get("lastUpdated"),
    }


@app.get("/players/{player_id}")
async def player_detail(player_id: str):
    snapshot = await get_bootstrap()
    player = next((item for item in snapshot.get("playersCatalog", {}).get("players", []) if item.get("id") == player_id), None)
    if not player:
        raise HTTPException(status_code=404, detail=f"Player detail for {player_id} was not found.")
    return {
        "sport": "cbb",
        "player": player,
        "stats": [],
        "analysis": f"{player['displayName']} sits in the current CBB board with {player['usageSummary'].lower()}.",
        "lastUpdated": snapshot.get("lastUpdated"),
    }


@app.get("/teams/{team_id}")
async def team_detail(team_id: str):
    snapshot = await get_bootstrap()
    team = next((item for item in snapshot.get("rankings", []) if item.get("id") == team_id), None)
    if not team:
        raise HTTPException(status_code=404, detail=f"Team detail for {team_id} was not found.")
    roster = [player for player in snapshot.get("playersCatalog", {}).get("players", []) if player.get("team", {}).get("id") == team_id]
    return {
        "sport": "cbb",
        "team": team,
        "recent": team.get("recent", []),
        "roster": roster,
        "leaders": roster[:5],
        "compositeProfile": {
            "avgRank": team.get("avgRank"),
            "offRank": team.get("offRank"),
            "defRank": team.get("defRank"),
            "sourceRanks": team.get("sourceRanks"),
            "hotness": team.get("hotness"),
            "trend": team.get("trend"),
        },
        "lastUpdated": snapshot.get("lastUpdated"),
    }


@app.get("/predictor")
async def predictor(
    homeTeamId: str = Query(default=""),
    awayTeamId: str = Query(default=""),
):
    snapshot = await get_bootstrap()
    predictors = snapshot.get("predictors", [])
    if not homeTeamId or not awayTeamId:
        return {"predictors": predictors, "lastUpdated": snapshot.get("lastUpdated")}
    match = next(
        (
            item
            for item in predictors
            if item.get("home", {}).get("teamId") == homeTeamId and item.get("away", {}).get("teamId") == awayTeamId
        ),
        None,
    )
    if match:
        return {**match, "lastUpdated": snapshot.get("lastUpdated")}
    raise HTTPException(status_code=404, detail="Predictor card for that matchup was not found.")
