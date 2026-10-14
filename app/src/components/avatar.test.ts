import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gravatarHash } from './avatar'

test('hash do Gravatar ignora espaços e maiúsculas do email', async () => {
  assert.equal(await gravatarHash(' MyEmailAddress@example.com '), '84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee')
})
