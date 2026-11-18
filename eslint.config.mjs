import babelParser from '@babel/eslint-parser';
export default [
  { ignores: ['**/dist/**', 'node_modules/**', '.cache/**'] },
  {
    files: ['apps/**/*.ts', 'packages/**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript', 'decorators-legacy'] },
        },
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'TSAnyKeyword', message: 'Use explicit types or unknown.' },
      ],
    },
  },
  {
    files: ['packages/domain/**/*.ts', 'packages/application/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ImportExpression, TSImportEqualsDeclaration, CallExpression[callee.name="require"], TSAnyKeyword',
          message: 'Pure layers use statically checked imports.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!node:|[.]{1,2}/|@heimdall/domain$)',
              message:
                'Application imports only domain, the standard library and local modules.',
            },
            {
              group: [
                '@nestjs/*',
                'express',
                'express/*',
                'class-validator',
                'class-transformer',
                'pg',
                'pg/*',
                '@prisma/*',
                '@heimdall/adapters',
                '@heimdall/adapters/*',
                '**/apps/**',
                '**/adapters/**',
              ],
              message:
                'Domain and application code must remain framework and adapter independent.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!node:|[.]{1,2}/)',
              message:
                'Domain depends only on the standard library and local domain files.',
            },
            {
              group: ['**/application/**', '**/apps/**', '**/adapters/**'],
              message: 'Domain cannot import outer layers.',
            },
          ],
        },
      ],
    },
  },
];
