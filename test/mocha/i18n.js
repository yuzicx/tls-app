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
    expect(i18n.fromSource('Found 1118 matches, showing 1 to 50'))
      .to.equal('找到 1118 个匹配项，显示第 1 至 50 项')
    expect(i18n.fromSource('line 23 / 42%'))
      .to.equal('第 23 行 / 42%')
    expect(i18n.fromSource('Resp: CW'))
      .to.equal('责任人：CW')
    expect(i18n.fromSource('line / %'))
      .to.equal('行号 / 进度')
    expect(i18n.fromSource('Taxonomy of meanings for 之:'))
      .to.equal('之 的义项分类：')
    expect(i18n.fromSource('Words (19 items)'))
      .to.equal('词语（19 项）')
    expect(i18n.fromSource('Alternate labels (0)'))
      .to.equal('其他名称（0）')
    expect(i18n.fromSource('Criteria and general notes (1397 characters)'))
      .to.equal('判据与综合说明（1397 字符）')
    expect(i18n.fromSource('Bibliography (4 items)'))
      .to.equal('参考文献（4 项）')
    expect(i18n.fromSource('246 Attributions'))
      .to.equal('246 个义项标注')
    expect(i18n.fromSource('1 Attribution'))
      .to.equal('1 个义项标注')
    expect(i18n.fromSource('Total: 407'))
      .to.equal('总计：407')
    expect(i18n.fromSource('Click here to search for 尚書大傳 in WikiData'))
      .to.equal('点击在 Wikidata 中搜索“尚書大傳”')
    expect(i18n.fromSource('anc: 3/1, child: 7'))
      .to.equal('上级：3/1，下级：7')
    expect(i18n.fromSource('Search 麒麟 in Kanseki Repository'))
      .to.equal('在汉籍リポジトリ中检索“麒麟”')
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
