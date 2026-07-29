'use strict'

const expect = require('chai').expect
const fs = require('fs')
const xmldoc = require('xmldoc')

function loadCatalogue(language) {
  const xml = fs.readFileSync(`interface/i18n/${language}.xml`, 'utf8')
  const document = new xmldoc.XmlDocument(xml)
  return document.childrenNamed('message').map((message) => ({
    key: message.attr.key,
    source: message.attr.source,
    value: message.val.trim()
  }))
}

function valuesByKey(messages) {
  return new Map(messages.map((message) => [message.key, message.value]))
}

describe('interface catalogues', function () {
  const english = loadCatalogue('en')
  const simplifiedChinese = loadCatalogue('zh-Hans')

  it('defines every key exactly once', function () {
    ;[english, simplifiedChinese].forEach((messages) => {
      const keys = messages.map((message) => message.key)
      expect(new Set(keys).size).to.equal(keys.length)
    })
  })

  it('keeps the English and Simplified Chinese key sets in sync', function () {
    const englishKeys = english.map((message) => message.key).sort()
    const chineseKeys = simplifiedChinese.map((message) => message.key).sort()
    expect(chineseKeys).to.deep.equal(englishKeys)
  })

  it('provides source text and a non-empty value for every message', function () {
    ;[english, simplifiedChinese].forEach((messages) => {
      messages.forEach((message) => {
        expect(message.key).to.be.a('string').and.not.empty
        expect(message.source, message.key).to.be.a('string').and.not.empty
        expect(message.value, message.key).to.be.a('string').and.not.empty
      })
    })
  })

  it('uses identical source text for matching language keys', function () {
    const chineseSources = new Map(
      simplifiedChinese.map((message) => [message.key, message.source])
    )
    english.forEach((message) => {
      expect(chineseSources.get(message.key), message.key).to.equal(message.source)
    })
  })

  it('contains the global navigation, account and search messages', function () {
    const chinese = valuesByKey(simplifiedChinese)
    ;[
      'nav.browse',
      'nav.texts',
      'search.search',
      'account.login',
      'language.label'
    ].forEach((key) => expect(chinese.has(key), key).to.equal(true))
  })
})
