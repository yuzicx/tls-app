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
    mode: message.attr.mode,
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

function createBrowserI18n(messages, language = 'zh-Hans') {
  const sources = Object.fromEntries(
    messages
      .filter((message) => message.mode !== 'key-only')
      .map((message) => [message.source.replace(/\s+/g, ' ').trim(), message.value])
  )
  const keyedMessages = Object.fromEntries(
    messages.map((message) => [message.key, message.value])
  )
  const window = {
    location: {
      href: `https://example.test/index.html?lang=${language}`,
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
        textContent: JSON.stringify({ language, messages: keyedMessages, sources })
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
  const japanese = loadCatalogue('ja')
  const catalogues = { en: english, 'zh-Hans': simplifiedChinese, ja: japanese }
  const localizedCatalogues = { 'zh-Hans': simplifiedChinese, ja: japanese }

  it('defines every key exactly once', function () {
    Object.values(catalogues).forEach((messages) => {
      const keys = messages.map((message) => message.key)
      expect(new Set(keys).size).to.equal(keys.length)
    })
  })

  it('keeps every localized key set in sync with English', function () {
    const englishKeys = english.map((message) => message.key).sort()
    Object.entries(localizedCatalogues).forEach(([language, messages]) => {
      const localizedKeys = messages.map((message) => message.key).sort()
      expect(localizedKeys, language).to.deep.equal(englishKeys)
    })
  })

  it('provides source text and a non-empty value for every message', function () {
    Object.values(catalogues).forEach((messages) => {
      messages.forEach((message) => {
        expect(message.key).to.be.a('string').and.not.empty
        expect(message.source, message.key).to.be.a('string').and.not.empty
        expect(message.value, message.key).to.be.a('string').and.not.empty
      })
    })
  })

  it('uses identical source text for matching language keys', function () {
    Object.entries(localizedCatalogues).forEach(([language, messages]) => {
      const localizedSources = new Map(
        messages.map((message) => [message.key, message.source])
      )
      english.forEach((message) => {
        expect(localizedSources.get(message.key), `${language}:${message.key}`)
          .to.equal(message.source)
      })
    })
  })

  it('keeps placeholders unchanged between source text and translations', function () {
    Object.entries(localizedCatalogues).forEach(([language, messages]) => {
      messages.forEach((message) => {
        expect(placeholders(message.value), `${language}:${message.key}`)
          .to.deep.equal(placeholders(message.source))
      })
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
    expect(i18n.fromSource('504888 594347 characters.'))
      .to.equal('504888 594347 字。')
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

  it('preserves surrounding whitespace when translating interface text nodes', function () {
    const i18n = createBrowserI18n(simplifiedChinese)
    const textNode = { nodeType: 3, nodeValue: '  246 Attributions ' }
    const element = {
      nodeType: 1,
      tagName: 'SMALL',
      childNodes: [textNode],
      closest() { return this },
      getAttribute(name) { return name === 'data-i18n-scope' ? 'ui' : null },
      hasAttribute(name) { return name === 'data-i18n-scope' },
      querySelectorAll() { return [] }
    }

    i18n.localize(element)

    expect(textNode.nodeValue).to.equal('  246 个义项标注 ')
  })

  it('translates Japanese runtime messages while preserving their variable values', function () {
    const i18n = createBrowserI18n(japanese, 'ja')

    expect(i18n.language).to.equal('ja')
    expect(i18n.fromSource('Email has been sent to editor@example.org'))
      .to.equal('電子メールは editor@example.org に送信されました')
    expect(i18n.fromSource('Found 1118 matches, showing 1 to 50'))
      .to.equal('1118 件が一致しました。1～50 件目を表示しています')
    expect(i18n.fromSource('Taxonomy of meanings for 之:'))
      .to.equal('之 の語義分類：')
    expect(i18n.fromSource('Words (19 items)'))
      .to.equal('語（19 件）')
    expect(i18n.fromSource('246 Attributions'))
      .to.equal('246 件の語義注釈')
    expect(i18n.fromSource('Search 麒麟 in Kanseki Repository'))
      .to.equal('漢籍リポジトリで 麒麟 を検索')
  })

  it('contains the global navigation, account and search messages', function () {
    Object.entries(localizedCatalogues).forEach(([language, messages]) => {
      const values = valuesByKey(messages)
      ;[
        'nav.browse',
        'nav.texts',
        'search.search',
        'account.login',
        'language.label'
      ].forEach((key) => expect(values.has(key), `${language}:${key}`).to.equal(true))
    })
  })

  it('translates data-backed text facets by category id', function () {
    const i18n = createBrowserI18n(simplifiedChinese)

    expect(i18n.t('facet.category.annotation')).to.equal('已标注文本')
    expect(i18n.t('facet.category.tr-zh')).to.equal('现代汉语翻译')
    expect(i18n.t('facet.category.state-green')).to.equal('编辑完成')
    expect(i18n.t('facet.category.dat04380')).to.equal('金')
    expect(i18n.t('facet.category.dat04550')).to.equal('晋')
    expect(i18n.fromSource('Jin')).to.equal('Jin')
  })

  it('translates Japanese data-backed text facets by category id', function () {
    const i18n = createBrowserI18n(japanese, 'ja')

    expect(i18n.t('facet.category.annotation')).to.equal('注釈済みテキスト')
    expect(i18n.t('facet.category.tr-ja')).to.equal('日本語翻訳')
    expect(i18n.t('facet.category.state-green')).to.equal('編集完了')
    expect(i18n.t('facet.category.dat04380')).to.equal('金代')
    expect(i18n.t('facet.category.dat04550')).to.equal('晋')
    expect(i18n.fromSource('Jin')).to.equal('Jin')
  })

  it('localizes selected facet titles in every search summary', function () {
    const searchSource = fs.readFileSync('modules/search.xql', 'utf8')
    const localizedTitleCalls = searchSource.match(/src:localized-category-titles\(/g) || []

    expect(searchSource).to.include('data-i18n="facet.category.{$category}"')
    expect(localizedTitleCalls).to.have.length(4)
  })

  it('supports Japanese language tags in both localization runtimes', function () {
    const serverSource = fs.readFileSync('modules/lib/i18n.xqm', 'utf8')
    const browserSource = fs.readFileSync('resources/scripts/i18n.js', 'utf8')

    expect(serverSource).to.include('("en", "zh-Hans", "ja")')
    expect(serverSource).to.include('starts-with($language, "ja-")')
    expect(serverSource).to.include("onclick=\"tlsSetLanguage('ja')\"")
    expect(serverSource).to.include('lang="{i18n:language()}"')
    expect(browserSource).to.include("normalized.indexOf('ja-') === 0")
  })

  it('provides every rich interface fragment in Japanese', function () {
    ;['ai-rationale.xml', 'basic-texts.xml', 'browse.xml', 'welcome.xml']
      .forEach((file) => {
        const xml = fs.readFileSync(`interface/ja/${file}`, 'utf8')
        expect(() => new xmldoc.XmlDocument(xml), file).not.to.throw()
      })
  })

  it('marks taxonomy labels with category-specific translation keys', function () {
    const source = fs.readFileSync('modules/search.xql', 'utf8')
    const markers = source.match(/data-i18n="facet\.category\.\{\$n\/@xml:id\}"/g) || []

    expect(markers.length).to.equal(3)
  })

  it('preserves multi-valued character counts for dynamic translation', function () {
    const source = fs.readFileSync('modules/tlslib.xql', 'utf8')

    expect(source).to.include('>{$charcount} characters.</span>')
    expect(source).not.to.include('$charcount || " characters."')
  })
})
