These are unmodified fixtures from `mustache/spec` v1.3.0,
commit `5d3b58ea35ae309c40d7a8111bfedc4c5bcd43a6`:
https://github.com/mustache/spec/tree/5d3b58ea35ae309c40d7a8111bfedc4c5bcd43a6/specs

The upstream license is included in `LICENSE`. i18n supplies no partial templates,
so partial-specific cases are excluded; missing partial tags still render as empty.
Optional inheritance and dynamic partial names are also outside this renderer.
Mustache.js function-valued views and higher-order sections have their own
JavaScript behavior; these are covered by explicit tests instead of the optional
language-independent lambda extension.
