// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  MERGE_TAG_SYNTAXES,
  bodyIdentityHash,
  hasUnfilledMergeTag,
  isLinkOnly,
  normalizeBody,
  wordCount,
} from '@/server/reports/comms/comm-content-features'

// Gate 4E — adversarial synthetic tests for the DETERMINISTIC content primitives. Synthetic text
// only (no real customer content). Each primitive is the literal surface pattern of an SW
// condition; these tests pin normalization, URLs, punctuation, templates, empties, and
// multilingual text so a later change to the rule fails the suite instead of shipping a proxy.

describe('wordCount — deterministic, language-agnostic', () => {
  it('counts whitespace tokens containing a letter/number', () => {
    expect(wordCount('Hello world')).toBe(2)
    expect(wordCount('one')).toBe(1)
    expect(wordCount('a, b, c!')).toBe(3)
  })
  it('empty / whitespace / punctuation-only ⇒ 0 words', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n\t ')).toBe(0)
    expect(wordCount('!!! ??? ...')).toBe(0)
  })
  it('collapses runs of whitespace and ignores bare emoji tokens', () => {
    expect(wordCount('hi     there')).toBe(2)
    expect(wordCount('café ☕ 3pm')).toBe(2)
  })
  it('counts multilingual (Unicode letter) words', () => {
    expect(wordCount('Hola cómo estás')).toBe(3)
    expect(wordCount('你好 世界')).toBe(2)
  })
  it('a URL is one token/word (link-only handled separately)', () => {
    expect(wordCount('https://x.com only two')).toBe(3)
  })
})

describe('hasUnfilledMergeTag — enumerated delimiter syntaxes only', () => {
  it('detects each enumerated unfilled syntax', () => {
    expect(hasUnfilledMergeTag('Hi {{FirstName}}')).toBe(true)
    expect(hasUnfilledMergeTag('Hi {FirstName}')).toBe(true)
    expect(hasUnfilledMergeTag('Hi [[FirstName]]')).toBe(true)
    expect(hasUnfilledMergeTag('Hi <<FirstName>>')).toBe(true)
    expect(hasUnfilledMergeTag('Hi %%FirstName%%')).toBe(true)
    expect(hasUnfilledMergeTag('Hi %FirstName%')).toBe(true)
    expect(hasUnfilledMergeTag('Hi $FirstName$')).toBe(true)
  })
  it('a FILLED template (no delimiters) does not match', () => {
    expect(hasUnfilledMergeTag('Hi John, welcome to Serra!')).toBe(false)
    expect(hasUnfilledMergeTag('Your price is $5 today')).toBe(false)
    expect(hasUnfilledMergeTag('email me at a@b.com')).toBe(false)
    expect(hasUnfilledMergeTag('json {"a":1}')).toBe(false)
    expect(hasUnfilledMergeTag('')).toBe(false)
  })
  it('discloses exactly seven enumerated syntaxes (recall boundary)', () => {
    expect(MERGE_TAG_SYNTAXES.length).toBe(7)
  })
})

describe('isLinkOnly — URL present and no other words', () => {
  it('bare link(s) ⇒ true', () => {
    expect(isLinkOnly('https://x.com')).toBe(true)
    expect(isLinkOnly('www.example.com')).toBe(true)
    expect(isLinkOnly('http://a.co http://b.co')).toBe(true)
    expect(isLinkOnly('https://x.com !!!')).toBe(true)
  })
  it('any conversational word alongside a link ⇒ false', () => {
    expect(isLinkOnly('https://x.com thanks')).toBe(false)
    expect(isLinkOnly('Check this: https://x.com')).toBe(false)
  })
  it('no URL ⇒ false (including empty)', () => {
    expect(isLinkOnly('no link here')).toBe(false)
    expect(isLinkOnly('')).toBe(false)
  })
})

describe('normalizeBody / bodyIdentityHash — trim-only "identical"', () => {
  it('trims only; preserves case and internal whitespace', () => {
    expect(normalizeBody('  hi there  ')).toBe('hi there')
    expect(bodyIdentityHash('  hi  ')).toBe(bodyIdentityHash('hi'))
  })
  it('case and internal-whitespace differences are NOT identical', () => {
    expect(bodyIdentityHash('hi')).not.toBe(bodyIdentityHash('HI'))
    expect(bodyIdentityHash('hi there')).not.toBe(bodyIdentityHash('hi  there'))
  })
  it('identical bodies hash equal; blank ⇒ empty identity (not a hash)', () => {
    expect(bodyIdentityHash('Thanks for coming in!')).toBe(
      bodyIdentityHash('Thanks for coming in!'),
    )
    expect(bodyIdentityHash('')).toBe('')
    expect(bodyIdentityHash('   ')).toBe('')
  })
  it('the identity is a 16-hex one-way hash (never the body)', () => {
    const h = bodyIdentityHash('some body text')
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })
})
