from pathlib import Path
import re

p=Path('workers/nomadtips3-engine-343/src/index.js')
s=p.read_text()

checks={
 'version': "const VERSION='nomad343-engine-v4-10book-referee';" in s,
 'ten_books': all(x in s for x in ["slug:'bet365'","slug:'pinnacle'","slug:'crown'","slug:'1xbet'","slug:'12bet'","slug:'interwetten'","slug:'macauslot'","slug:'18bet'","slug:'vcbet'","slug:'easybets'"]),
 'single_multi_request': "bookmakers=${encodeURIComponent(REFEREE_BOOK_QUERY)}" in s,
 'selected_uses_multi': "referee=await fetchRefereeOdds(id,this.env);refereeRequests++" in s,
 'request_cap_unchanged': "const MAX_ODDS_FIXTURES_PER_SCAN=4;" in s,
 'scan_gap_unchanged': "const MIN_SCAN_GAP_MS=60_000;" in s,
 'line_match_required': "!sameLine(price.line,authority.line)" in s,
 'bet365_line_authority': "authority=priceFor(referee.bet365Root,c.market,c.selection)" in s,
 'best_odds_within_candidate': "choices.sort((a,b)=>b.price.odds-a.price.odds)" in s,
 'price_does_not_pick_selection': "passed.sort((a,b)=>b.strength-a.strength);" in s,
 'chosen_book_persisted': "bookmaker:best.bookmaker" in s,
 'chosen_snapshots': "openingPrice:stageSnapshot(best.priceRoot,def,'opening')" in s,
 'telemetry': "bookmakersRequested:REFEREE_BOOKS.length" in s,
}
failed=[k for k,v in checks.items() if not v]
if failed:
    raise SystemExit('FAILED '+','.join(failed))

# Ensure the candidate referee loop makes exactly one provider call per selected fixture.
loop=re.search(r"for\(const item of selected\)\{(.*?)let reconciled=0;",s,re.S)
if not loop:
    raise SystemExit('FAILED selected_loop_not_found')
body=loop.group(1)
if body.count('fetchRefereeOdds(id,this.env)')!=1:
    raise SystemExit('FAILED selected_loop_provider_call_count')
if 'fetchFullOdds(id,this.env)' in body:
    raise SystemExit('FAILED selected_loop_still_calls_bet365_endpoint')

# Engine legacy UI/backfill Bet365 fetch is intentionally preserved; no other subsystems are moved.
if s.count('bookmakers=bet365')!=1:
    raise SystemExit('FAILED legacy_bet365_fetch_changed')

print('10BOOK_REFEREE_INVARIANTS_OK',checks)
