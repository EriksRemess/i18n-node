clean:
	rm -rf ./localestowrite
	rm -rf ./localesmakeplural

test: clean
	npm run test

.PHONY: test examples
