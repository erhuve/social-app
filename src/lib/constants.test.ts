import {FEEDBACK_FORM_URL, HELP_DESK_URL, webLinks} from '#/lib/constants'

describe('Meadow-owned external destinations', () => {
  it('uses fork-owned support and policy links', () => {
    expect(HELP_DESK_URL).toContain('github.com/erhuve/social-app')
    expect(Object.values(webLinks)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('github.com/erhuve/social-app'),
      ]),
    )
    for (const url of [HELP_DESK_URL, ...Object.values(webLinks)]) {
      expect(url).not.toContain('bsky.social/about/support')
      expect(url).not.toContain('blueskyweb.zendesk.com')
    }
  })

  it('does not place email addresses in public issue URLs', () => {
    const url = FEEDBACK_FORM_URL({
      email: 'private@example.com',
      handle: 'alice.test',
    })

    expect(url).toContain('github.com/erhuve/social-app/issues/new')
    expect(url).not.toContain('alice.test')
    expect(url).not.toContain('private%40example.com')
    expect(url).not.toContain('private@example.com')
  })
})
