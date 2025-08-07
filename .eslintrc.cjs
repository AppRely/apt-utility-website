module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  plugins: ['@typescript-eslint', 'tailwindcss'],
  rules: {
    'tailwindcss/no-custom-classname': 'off',
  },
};
