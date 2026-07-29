'use strict'

const expect = require('chai').expect
const fs = require('fs')
const vm = require('vm')
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

function placeholders(value) {
  return Array.from(value.matchAll(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g))
    .map((match) => match[1])
    .sort()
}

function createBrowserI18n(messages) {
  const sources = Object.fromEntries(
    messages.map((message) => [message.source.replace(/\s+/g, ' ').trim(), message.value])
  )
  const window = {
    location: {
      href: 'https://example.test/index.html?lang=zh-Hans',
      assign() {},
      replace() {}
    },
    localStorage: {
      getItem() { return null },
      setItem() {}
    },
    alert() {},
    confirm() {},
    prompt() {},
    console
  }
  const document = {
    body: null,
    documentElement: { setAttribute() {} },
    getElementById() {
      return {
        textContent: JSON.stringify({ language: 'zh-Hans', messages: {}, sources })
      }
    }
  }

  vm.runInNewContext(
    fs.readFileSync('resources/scripts/i18n.js', 'utf8'),
    { window, document, URL, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } }
  )
  return window.TLSI18n
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

  it('keeps placeholders unchanged between source text and translations', function () {
    simplifiedChinese.forEach((message) => {
      expect(placeholders(message.value), message.key)
        .to.deep.equal(placeholders(message.source))
    })
  })

  it('translates runtime messages while preserving their variable values', function () {
    const i18n = createBrowserI18n(simplifiedChinese)

    expect(i18n.fromSource('Email has been sent to editor@example.org'))
      .to.equal('邮件已发送至 editor@example.org')
    expect(i18n.fromSource("No syntactic function 'SUBJ' defined.  If you want to define a new one, please enter the definition here:"))
      .to.equal('尚未定义句法功能“SUBJ”。如需新建，请在此输入定义：')
    expect(i18n.fromSource('Tag reviewed for 12 item(s) saved.'))
      .to.equal('已为 12 个项目保存标签“reviewed”。')
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
