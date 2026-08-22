import test from 'node:test';
import assert from 'node:assert/strict';
import {nowgoalMappingCompatible} from '../src/nowgoal.js';

test('Nowgoal mapper rejects senior vs U21 identity mismatch',()=>{
  assert.equal(nowgoalMappingCompatible(
    {home:'Team A',away:'Team C',score:{home:1,away:0}},
    {home:'Team A U21',away:'Team C U21',score:{home:1,away:0}}
  ),false);
});

test('Nowgoal mapper rejects men vs women identity mismatch',()=>{
  assert.equal(nowgoalMappingCompatible(
    {home:'Fortuna Aalesund',away:'Haugesund',score:{home:2,away:1}},
    {home:'Fortuna Aalesund (W)',away:'Haugesund (W)',score:{home:2,away:1}}
  ),false);
});

test('Nowgoal mapper rejects first team vs reserve identity mismatch',()=>{
  assert.equal(nowgoalMappingCompatible(
    {home:'Club Alpha',away:'Club Beta',score:{home:0,away:0}},
    {home:'Club Alpha B',away:'Club Beta B',score:{home:0,away:0}}
  ),false);
});

test('Nowgoal mapper rejects a similar-name match when current score disagrees',()=>{
  assert.equal(nowgoalMappingCompatible(
    {home:'Team A',away:'Team C',score:{home:2,away:3}},
    {home:'Team A',away:'Team C',score:{home:1,away:3}}
  ),false);
});

test('Nowgoal mapper accepts same competition identity and same current score',()=>{
  assert.equal(nowgoalMappingCompatible(
    {home:'Team A U21',away:'Team C U21',score:{home:2,away:3}},
    {home:'Team A U21',away:'Team C U21',score:{home:2,away:3}}
  ),true);
});
