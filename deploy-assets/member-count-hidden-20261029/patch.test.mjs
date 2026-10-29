import assert from 'node:assert/strict';import {test} from 'node:test';import {concealMemberCount} from './patch.mjs';
const count='<span class="b46-premium-members" aria-label="Members 1,011 (display example)"><span class="b46-premium-detail"><strong>1,011</strong></span></span>';
test('removes visible and accessible count only',()=>{const left='<a href="https://member.ball46.com/pricing"><svg></svg><span>MEMBER</span>';assert.equal(concealMemberCount(left+count+'</a>'),left+'</a>');});
test('fails closed on absent or duplicate count',()=>{assert.throws(()=>concealMemberCount('MEMBER'));assert.throws(()=>concealMemberCount(count+count));});
