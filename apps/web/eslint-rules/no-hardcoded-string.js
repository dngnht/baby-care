/**
 * Local ESLint rule: reject hard-coded user-facing copy.
 *
 * Why: every Vietnamese UI string must live in `src/core/i18n/vi.json` and be
 * read through `t('key')`. Otherwise translation and copy review are
 * impossible and typos ship straight to parents.
 *
 * Reported:
 *   1. JSX text nodes containing at least one letter
 *      (whitespace / numbers / symbols / emoji only are fine).
 *   2. String or template literals wired to user-facing JSX attributes:
 *      `placeholder`, `title`, `alt`, `aria-label`, `aria-description`,
 *      `aria-placeholder`, `label`.
 *   3. String or template literals rendered directly as a JSX child.
 *   4. Vietnamese literals passed to `alert` / `confirm` / `prompt`.
 *
 * Allowed: empty strings, letter-free strings, class names and every technical
 * attribute (`className`, `data-*`, `key`, `id`, `type`, `href`, `src`, `role`,
 * `name`, `value`, SVG props, ...), import paths, and anything inside
 * `src/core/i18n/**` or test files.
 *
 * This is deliberately a local rule (no third-party i18n plugin) so the policy
 * matches this repository exactly.
 */

const HARDCODED_MESSAGE = "Use t('key') — add the key to src/core/i18n/vi.json"

const UI_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'label',
])

const UI_CALLS = new Set(['alert', 'confirm', 'prompt'])

/** Any Vietnamese letter carrying a diacritic (including `đ`). */
const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i

/** At least one Unicode letter: skips whitespace, digits, punctuation, emoji. */
const HAS_LETTER = /\p{L}/u

const IGNORED_SEGMENTS = ['/core/i18n/', '/__tests__/']
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

function isIgnoredFile(filename) {
  if (typeof filename !== 'string' || filename === '') return false

  const path = `/${filename.replaceAll('\\', '/')}`
  if (IGNORED_SEGMENTS.some((segment) => path.includes(segment))) return true
  return TEST_FILE.test(path)
}

function attributeName(name) {
  if (!name) return null
  if (name.type === 'JSXIdentifier') return name.name
  if (
    name.type === 'JSXNamespacedName' &&
    name.namespace.type === 'JSXIdentifier' &&
    name.name.type === 'JSXIdentifier'
  ) {
    return `${name.namespace.name}:${name.name.name}`
  }
  return null
}

/**
 * Return the literal string a node represents, or `null` when it is not a
 * string/template literal. Template expressions are dropped, which is enough
 * to detect copy around them (`{n} tháng` -> " tháng").
 */
function literalText(node) {
  if (!node) return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('')
  }
  return null
}

function isUiCall(callee) {
  if (!callee) return false
  if (callee.type === 'Identifier') return UI_CALLS.has(callee.name)
  if (
    callee.type === 'MemberExpression' &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'window' &&
    callee.property?.type === 'Identifier'
  ) {
    return UI_CALLS.has(callee.property.name)
  }
  return false
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hard-coded user-facing strings outside the i18n dictionary',
      recommended: false,
    },
    schema: [],
    messages: {
      hardcoded: HARDCODED_MESSAGE,
    },
  },

  create(context) {
    const filename = context.filename ?? ''
    if (isIgnoredFile(filename)) return {}

    function reportLiteral(node) {
      const text = literalText(node)
      if (text === null || !HAS_LETTER.test(text)) return
      context.report({ node, messageId: 'hardcoded' })
    }

    return {
      JSXText(node) {
        if (!HAS_LETTER.test(node.value)) return
        context.report({ node, messageId: 'hardcoded' })
      },

      JSXAttribute(node) {
        const name = attributeName(node.name)?.toLowerCase()
        if (name === undefined || !UI_ATTRIBUTES.has(name)) return

        if (node.value?.type === 'Literal') {
          reportLiteral(node.value)
          return
        }
        if (node.value?.type === 'JSXExpressionContainer') {
          reportLiteral(node.value.expression)
        }
      },

      JSXExpressionContainer(node) {
        // Attribute values are handled by `JSXAttribute` above.
        if (node.parent?.type === 'JSXAttribute') return
        if (node.expression?.type === 'JSXEmptyExpression') return
        reportLiteral(node.expression)
      },

      CallExpression(node) {
        if (!isUiCall(node.callee)) return

        for (const argument of node.arguments) {
          const text = literalText(argument)
          if (text !== null && VIETNAMESE.test(text)) {
            context.report({ node: argument, messageId: 'hardcoded' })
          }
        }
      },
    }
  },
}

export default rule
