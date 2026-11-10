import test from 'node:test';
import assert from 'node:assert/strict';
import { webBaseUrl, gameShareUrl, seriesShareUrl, PROD_WEB_URL } from './shareUrl.ts';

test('defaults to production web origin', () => {
    assert.equal(webBaseUrl(undefined), PROD_WEB_URL);
    assert.equal(webBaseUrl('not a url'), PROD_WEB_URL);
    assert.equal(webBaseUrl('http://insecure.example'), PROD_WEB_URL);
});
test('honours an https override and trims slashes', () => {
    assert.equal(webBaseUrl('https://dev.example.app/'), 'https://dev.example.app');
});
test('builds canonical plural paths', () => {
    assert.equal(gameShareUrl('abc', PROD_WEB_URL), 'https://join-up-app.vercel.app/games/abc');
    assert.equal(seriesShareUrl('x y', PROD_WEB_URL), 'https://join-up-app.vercel.app/series/x%20y');
});
