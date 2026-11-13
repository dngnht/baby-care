import { RuleTester } from 'eslint'
import { parser as tsParser } from 'typescript-eslint'
import { describe, expect, it } from 'vitest'
import rule from '../no-hardcoded-string.js'

// Let RuleTester reuse Vitest's runner instead of starting its own.
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

const PAGE = 'src/features/home/pages/Example.tsx'

ruleTester.run('no-hardcoded-string', rule, {
  valid: [
    {
      name: 'copy coming from t()',
      filename: PAGE,
      code: 'export const A = () => <button>{t("home.feed")}</button>;',
    },
    {
      name: 'technical attributes and classes are ignored',
      filename: PAGE,
      code:
        'export const A = () => <div className="flex gap-2" data-testid="cta" key="a" id="b" role="button" />;',
    },
    {
      name: 'letter-free JSX text is allowed',
      filename: PAGE,
      code: 'export const A = () => <span>.</span>;',
    },
    {
      name: 'numbers and symbols only are allowed',
      filename: PAGE,
      code: 'export const A = () => <span>0–24</span>;',
    },
    {
      name: 'empty alt (decorative image) is allowed',
      filename: PAGE,
      code: 'export const A = () => <img src="/icons/icon-192.png" alt="" />;',
    },
    {
      name: 'letter-free attribute values are allowed',
      filename: PAGE,
      code: 'export const A = () => <span title="★" />;',
    },
    {
      name: 'English strings outside UI calls are allowed',
      filename: 'src/core/db/repo.ts',
      code: 'export function f() { throw new TypeError("field must be a valid Date"); }',
    },
    {
      name: 'i18n dictionary files are exempt',
      filename: 'src/core/i18n/demo.tsx',
      code: 'export const A = () => <p>Bú</p>;',
    },
    {
      name: 'test files are exempt',
      filename: 'src/features/home/__tests__/Example.test.tsx',
      code: 'export const A = () => <p>Bú</p>;',
    },
    {
      name: 'English text passed to alert is allowed',
      filename: PAGE,
      code: 'export function f() { alert("saved"); }',
    },
  ],

  invalid: [
    {
      name: 'Vietnamese JSX text',
      filename: PAGE,
      code: 'export const A = () => <p>Xin chào</p>;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'English JSX text',
      filename: PAGE,
      code: 'export const A = () => <p>Hello</p>;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'placeholder attribute',
      filename: PAGE,
      code: 'export const A = () => <input placeholder="Chọn ngày" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'alt attribute',
      filename: PAGE,
      code: 'export const A = () => <img src="/a.png" alt="Ảnh em bé" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'aria-label template literal',
      filename: PAGE,
      code: 'export const A = ({ name }: { name: string }) => <button aria-label={`Mở ${name}`} />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'label prop on a component',
      filename: PAGE,
      code: 'export const A = () => <Field label="Tuổi" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'string literal rendered as a JSX child',
      filename: PAGE,
      code: 'export const A = () => <p>{"Bú"}</p>;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'Vietnamese alert copy',
      filename: PAGE,
      code: 'export function f() { alert("Bé đã bú 60ml"); }',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'Vietnamese template literal in confirm()',
      filename: PAGE,
      code: 'export function f(name: string) { return confirm(`Xóa ${name}?`); }',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      name: 'title attribute',
      filename: PAGE,
      code: 'export const A = () => <input title="Nhập cân nặng" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
  ],
})

describe('no-hardcoded-string meta', () => {
  it('points contributors at the dictionary', () => {
    expect(rule.meta.messages.hardcoded).toBe(
      "Use t('key') — add the key to src/core/i18n/vi.json",
    )
  })
})
