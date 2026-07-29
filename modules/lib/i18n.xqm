xquery version "3.1";

(:~
 : Application-local internationalization support.
 :
 : UI messages live in interface/i18n. Rich interface fragments remain in
 : language-specific collections below interface/. Only nodes explicitly
 : marked with data-i18n or data-i18n-scope="ui" are translated. A nested
 : data-i18n-scope="content" explicitly restores the content boundary, keeping
 : TEI source texts and other scholarly content outside the localization pass.
 :)

module namespace i18n="http://hxwd.org/lib/i18n";

import module namespace config="http://hxwd.org/config" at "../config.xqm";
import module namespace tlslib="http://hxwd.org/lib" at "../tlslib.xql";
import module namespace lrh="http://hxwd.org/lib/render-html" at "render-html.xqm";
import module namespace xmldb="http://exist-db.org/xquery/xmldb";

declare namespace templates="http://exist-db.org/xquery/templates";

declare variable $i18n:supported-languages := ("en", "zh-Hans");
declare variable $i18n:default-language := "en";
declare variable $i18n:session-key := "tls.ui.language";
declare variable $i18n:translatable-attributes :=
    ("aria-label", "placeholder", "title", "value");

declare function i18n:normalize-language($language as xs:string?) as xs:string? {
    let $language := lower-case(normalize-space($language))
    return
        if ($language = "en" or starts-with($language, "en-")) then
            "en"
        else if ($language = ("zh", "zh-cn", "zh-sg", "zh-hans")
                or starts-with($language, "zh-hans-")) then
            "zh-Hans"
        else
            ()
};

declare function i18n:language() as xs:string {
    let $create-session := session:create()
    let $requested := i18n:normalize-language(request:get-parameter("lang", ""))
    let $remember :=
        if ($requested = $i18n:supported-languages) then
            session:set-attribute($i18n:session-key, $requested)
        else
            ()
    let $stored := i18n:normalize-language(session:get-attribute($i18n:session-key))
    let $detected :=
        head(
            for $part in tokenize(string(request:get-header("Accept-Language")), ",")
            let $tag := tokenize(normalize-space($part), ";")[1]
            let $normalized := i18n:normalize-language($tag)
            where exists($normalized)
            return $normalized
        )
    return
        ($requested, $stored, $detected, $i18n:default-language)[1]
};

declare function i18n:catalog($language as xs:string?) as element(catalogue)? {
    let $language := (i18n:normalize-language($language), $i18n:default-language)[1]
    let $path := $config:tls-app-interface || "/i18n/" || $language || ".xml"
    return
        if (doc-available($path)) then
            doc($path)/catalogue
        else if ($language ne $i18n:default-language) then
            i18n:catalog($i18n:default-language)
        else
            ()
};

declare function i18n:t($key as xs:string) as xs:string {
    i18n:t($key, i18n:language(), $key)
};

declare function i18n:t($key as xs:string, $fallback as xs:string) as xs:string {
    i18n:t($key, i18n:language(), $fallback)
};

declare function i18n:t(
    $key as xs:string,
    $language as xs:string?,
    $fallback as xs:string
) as xs:string {
    let $language := (i18n:normalize-language($language), $i18n:default-language)[1]
    let $message := i18n:catalog($language)/message[@key = $key][1]
    let $default-message :=
        if ($language ne $i18n:default-language) then
            i18n:catalog($i18n:default-language)/message[@key = $key][1]
        else
            ()
    return string(($message, $default-message, $fallback)[1])
};

declare function i18n:from-source(
    $source as xs:string?,
    $language as xs:string?
) as xs:string {
    let $normalized-source := normalize-space($source)
    let $language := (i18n:normalize-language($language), $i18n:default-language)[1]
    let $message :=
        i18n:catalog($language)/message[normalize-space(@source) = $normalized-source][1]
    let $default-message :=
        if ($language ne $i18n:default-language) then
            i18n:catalog($i18n:default-language)/message[
                normalize-space(@source) = $normalized-source
            ][1]
        else
            ()
    return string(($message, $default-message, $source)[1])
};

declare function i18n:catalog-map($language as xs:string?) as map(*) {
    let $messages := i18n:catalog($language)/message
    return
        map:merge(
            for $message in $messages
            return map:entry(string($message/@key), string($message)),
            map { "duplicates": "use-last" }
        )
};

declare function i18n:source-map($language as xs:string?) as map(*) {
    let $messages := i18n:catalog($language)/message[normalize-space(@source)]
    return
        map:merge(
            for $message in $messages
            return map:entry(normalize-space(string($message/@source)), string($message)),
            map { "duplicates": "use-last" }
        )
};

declare function i18n:catalog-script($node as node(), $model as map(*)) {
    let $language := i18n:language()
    let $json := serialize(
        map {
            "language": $language,
            "messages": i18n:catalog-map($language),
            "sources": i18n:source-map($language)
        },
        map { "method": "json", "indent": false() }
    )
    return
        <script id="tls-i18n-catalog" type="application/json">{$json}</script>
};

declare function i18n:language-switcher($node as node(), $model as map(*)) {
    let $language := i18n:language()
    let $label :=
        if ($language = "zh-Hans") then "简体中文" else "English"
    return
        <div class="dropdown tls-language-switcher" data-i18n-scope="ui">
            <button class="btn btn-sm btn-light dropdown-toggle" type="button"
                    id="tls-language-menu" data-toggle="dropdown"
                    aria-haspopup="true" aria-expanded="false"
                    aria-label="Language">
                <span aria-hidden="true">文/A</span>
                <span class="ml-1">{$label}</span>
            </button>
            <div class="dropdown-menu dropdown-menu-right"
                 aria-labelledby="tls-language-menu">
                <button class="dropdown-item" type="button" lang="en"
                        onclick="tlsSetLanguage('en')">English</button>
                <button class="dropdown-item" type="button" lang="zh-Hans"
                        onclick="tlsSetLanguage('zh-Hans')">简体中文</button>
            </div>
        </div>
};

declare function i18n:localize-page($nodes as node()*) as node()* {
    let $language := i18n:language()
    return
        for $node in $nodes
        return i18n:localize-node($node, $language, false())
};

declare %private function i18n:localize-node(
    $node as node(),
    $language as xs:string,
    $inside-ui as xs:boolean
) as node() {
    typeswitch ($node)
        case document-node() return
            document {
                for $child in $node/node()
                return i18n:localize-node($child, $language, $inside-ui)
            }
        case element() return
            let $is-html := local-name($node) = "html"
            let $is-raw-text := local-name($node) = ("script", "style")
            let $scope := normalize-space(string($node/@data-i18n-scope))
            let $ui-scope :=
                (($inside-ui and $scope ne "content") or $scope = "ui")
                and not($is-raw-text)
            let $message-key := normalize-space(string($node/@data-i18n))
            return
                element { node-name($node) } {
                    for $attribute in $node/@*
                    let $attribute-name := local-name($attribute)
                    let $attribute-key := normalize-space(string(
                        $node/@*[local-name(.) = "data-i18n-" || $attribute-name]
                    ))
                    where not($is-html and $attribute-name = "lang")
                    return
                        attribute { node-name($attribute) } {
                            if ($attribute-key) then
                                i18n:t($attribute-key, $language, string($attribute))
                            else if ($ui-scope and
                                     $attribute-name = $i18n:translatable-attributes) then
                                i18n:from-source(string($attribute), $language)
                            else
                                string($attribute)
                        },
                    if ($is-html) then attribute lang { $language } else (),
                    if ($message-key) then
                        text {
                            i18n:t(
                                $message-key,
                                $language,
                                normalize-space(string($node))
                            )
                        }
                    else
                        for $child in $node/node()
                        return i18n:localize-node($child, $language, $ui-scope)
                }
        case text() return
            if ($inside-ui and normalize-space($node)) then
                let $translated := i18n:from-source(string($node), $language)
                return
                    if ($translated ne string($node)) then text { $translated }
                    else $node
            else
                $node
        default return $node
};

declare function i18n:fragment($id as xs:string) as node()* {
    let $language := i18n:language()
    let $language-path := $config:tls-app-interface || "/" || $language
    let $default-path := $config:tls-app-interface || "/" || $i18n:default-language
    let $selected :=
        if (xmldb:collection-available($language-path)) then
            collection($language-path)//div[@xml:id = $id]
        else
            ()
    return
        if ($selected) then $selected
        else collection($default-path)//div[@xml:id = $id]
};

declare function i18n:welcome-message() {
    let $user := sm:id()//sm:real/sm:username/text()
    let $recent := tlslib:recent-texts-list(10)
    return
        <div data-i18n-scope="ui">
            {
                if ($user = "guest") then
                    i18n:fragment("for-guests")
                else
                    <div>
                        <h3>Welcome back!</h3>
                        <ul>{for $item in $recent return $item}</ul>
                        <p>Please acknowledge your use of TLS in your publications.</p>
                    </div>
            }
            <p><a href="browse.html?type=welcome">Browse the database</a></p>
            <p><span class="text-danger">This website is under development.</span></p>
            <p>Problems and suggestions can be reported and discussed also on
                <a href="https://github.com/tls-kr/tls-app/issues">GitHub Issues</a>
            </p>
            <hr/>
        </div>
};

declare function i18n:display($map as map(*)) {
    if ($map?id = "ai-rationale") then
        <div>
            <div class="row" xml:id="ai-rationale" lang="en">
                <div class="col-md-2"/>
                {i18n:fragment("ai-use")}
            </div>
            <div class="row" xml:id="ai-rationale" lang="en">
                <div class="col-md-2"/>
                {lrh:ai-translations()}
            </div>
        </div>
    else
        i18n:fragment($map?id)
};
