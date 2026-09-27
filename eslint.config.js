import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Comments must describe the code as it is. These phrases mark history,
// process references or plan notes, which belong in git log and agent-docs.
const HISTORY_PHRASES = [
  /\bused to be\b/i,
  /\bpreviously\b/i,
  /\bformerly\b/i,
  /\bpredates\b/i,
  /\bregression\b/i,
  /\bIssue #\d/,
  /\bTD\d+\b/,
  /\bF-\d{3}\b/,
  /\(item [A-Z]\)/,
  /\bas in (the )?[a-z-]+ mode\b/i,
  /\bfor now\b/i,
];

const commentRules = {
  rules: {
    'no-history-comments': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Comments describe the current code, not its history.' },
        messages: { history: 'Comment reads as history or a process note ("{{phrase}}").' },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              const phrase = HISTORY_PHRASES.find((re) => re.test(comment.value));
              if (phrase) {
                context.report({
                  loc: comment.loc,
                  messageId: 'history',
                  data: { phrase: comment.value.match(phrase)[0] },
                });
              }
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: { comments: commentRules },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'comments/no-history-comments': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'examples/'],
  }
);
