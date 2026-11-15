# Route rules

- Route modules never share a non-exported helper between loader and component; shared helpers live in src/lib, because route code-splitting cannot import them and the resulting module error breaks hydration of every page.
