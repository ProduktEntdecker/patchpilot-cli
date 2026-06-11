// Curated list of high-download packages — the targets typosquatters imitate.
// Names must be lowercase; PyPI names in PEP 503 normalized form (hyphens).
// Extend via PRs; a fetch-based update script is tracked separately.

export const POPULAR_NPM_PACKAGES: ReadonlySet<string> = new Set([
  // Core utilities
  'lodash', 'underscore', 'ramda', 'async', 'bluebird', 'tslib', 'core-js',
  'moment', 'dayjs', 'date-fns', 'luxon', 'uuid', 'nanoid', 'slugify',
  'semver', 'minimist', 'yargs', 'commander', 'inquirer', 'chalk', 'debug',
  'dotenv', 'classnames', 'prop-types', 'immer', 'qs', 'query-string',
  'picocolors', 'kleur', 'colors', 'color', 'ansi-colors', 'strip-ansi',
  'string-width', 'wrap-ansi', 'supports-color', 'ora', 'boxen', 'figlet',
  'execa', 'shelljs', 'cross-spawn', 'cross-env', 'concurrently', 'npm-run-all',
  'rimraf', 'mkdirp', 'glob', 'globby', 'fast-glob', 'minimatch', 'micromatch',
  'picomatch', 'ignore', 'chokidar', 'fs-extra', 'del', 'open', 'tar',
  'archiver', 'jszip', 'adm-zip', 'extract-zip', 'unzipper',
  // Frameworks & view layers
  'react', 'react-dom', 'react-native', 'next', 'vue', 'nuxt', 'svelte',
  'angular', 'rxjs', 'redux', 'react-redux', 'zustand', 'mobx', 'reselect',
  'react-router', 'react-router-dom', 'expo', 'electron', 'ionic', 'cordova',
  'jquery', 'bootstrap', 'styled-components', 'tailwindcss', 'postcss',
  'autoprefixer', 'sass', 'less', 'stylus',
  // Servers & networking
  'express', 'koa', 'fastify', 'hapi', 'axios', 'node-fetch', 'got',
  'superagent', 'request', 'undici', 'ws', 'socket.io', 'cors', 'body-parser',
  'cookie-parser', 'express-session', 'multer', 'formidable', 'busboy',
  'form-data', 'mime', 'mime-types', 'file-type', 'http-server', 'serve',
  'json-server', 'nodemailer', 'helmet', 'morgan', 'compression',
  // Auth & crypto
  'passport', 'jsonwebtoken', 'bcrypt', 'bcryptjs', 'crypto-js', 'argon2',
  // Logging
  'winston', 'pino', 'bunyan', 'log4js', 'signale', 'consola', 'loglevel',
  // Databases & ORMs
  'mongoose', 'mongodb', 'mysql', 'mysql2', 'pg', 'sqlite3', 'better-sqlite3',
  'redis', 'ioredis', 'sequelize', 'typeorm', 'prisma', 'knex', 'level',
  // GraphQL & validation
  'graphql', 'apollo-server', 'ajv', 'joi', 'yup', 'zod', 'validator',
  'class-validator',
  // Build tools & compilers
  'typescript', 'webpack', 'webpack-cli', 'webpack-dev-server', 'vite',
  'rollup', 'esbuild', 'parcel', 'babel-loader', 'ts-node', 'tsx', 'swc',
  'terser', 'uglify-js', 'source-map', 'source-map-support', 'acorn',
  // Linting & formatting
  'eslint', 'prettier', 'stylelint', 'husky', 'lint-staged', 'standard',
  'eslint-plugin-react', 'eslint-plugin-import', 'eslint-config-prettier',
  // Testing
  'jest', 'vitest', 'mocha', 'chai', 'sinon', 'supertest', 'cypress',
  'playwright', 'puppeteer', 'jsdom', 'cheerio', 'karma', 'jasmine', 'ava',
  'nyc', 'c8', 'nodemon', 'faker',
  // Data & files
  'yaml', 'js-yaml', 'toml', 'ini', 'xml2js', 'fast-xml-parser', 'csv-parse',
  'csv-parser', 'papaparse', 'xlsx', 'exceljs', 'pdfkit', 'pdf-lib', 'sharp',
  'jimp', 'canvas', 'marked', 'markdown-it', 'js-beautify',
  // Cloud & APIs
  'aws-sdk', 'firebase', 'firebase-admin', 'stripe', 'twilio', 'openai',
  'langchain', 'ethers', 'web3', 'discord.js', 'telegraf', 'octokit',
  'simple-git', 'pm2',
  // Config & misc
  'cosmiconfig', 'configstore', 'conf', 'rc', 'update-notifier', 'zx',
  'eventemitter3', 'readable-stream', 'safe-buffer', 'buffer', 'events',
  'node-gyp', 'bindings', 'node-addon-api', 'progress', 'cli-progress',
  'cli-table3', 'table', 'listr2', 'regenerator-runtime', 'whatwg-fetch',
  'isomorphic-fetch', 'abort-controller', 'path-to-regexp', 'url-parse',
  'big.js', 'decimal.js', 'mathjs', 'numeral',
  // Popular scoped packages
  '@babel/core', '@babel/cli', '@babel/preset-env', '@babel/preset-react',
  '@babel/preset-typescript', '@babel/runtime', '@types/node', '@types/react',
  '@types/react-dom', '@types/express', '@types/lodash', '@types/jest',
  '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin',
  '@apollo/client', '@aws-sdk/client-s3', '@sendgrid/mail', '@slack/web-api',
  '@octokit/rest', '@changesets/cli', '@anthropic-ai/sdk',
]);

export const POPULAR_PYPI_PACKAGES: ReadonlySet<string> = new Set([
  // Core / packaging
  'pip', 'setuptools', 'wheel', 'virtualenv', 'pipenv', 'poetry', 'build',
  'twine', 'packaging', 'typing-extensions', 'importlib-metadata', 'zipp',
  'filelock', 'platformdirs', 'six', 'cython',
  // HTTP & networking
  'requests', 'urllib3', 'httpx', 'aiohttp', 'websockets', 'certifi', 'idna',
  'charset-normalizer', 'requests-oauthlib', 'oauthlib',
  // Data science & ML
  'numpy', 'pandas', 'scipy', 'matplotlib', 'seaborn', 'scikit-learn',
  'scikit-image', 'tensorflow', 'torch', 'torchvision', 'keras',
  'transformers', 'datasets', 'tokenizers', 'huggingface-hub', 'openai',
  'anthropic', 'langchain', 'tiktoken', 'nltk', 'spacy', 'gensim', 'numba',
  'joblib', 'plotly', 'bokeh', 'streamlit', 'gradio', 'xgboost', 'lightgbm',
  // Imaging & media
  'pillow', 'opencv-python', 'imageio', 'moviepy', 'yt-dlp',
  // Web frameworks
  'flask', 'django', 'fastapi', 'starlette', 'uvicorn', 'gunicorn',
  'tornado', 'sanic', 'bottle', 'celery', 'jinja2', 'markupsafe', 'werkzeug',
  'itsdangerous', 'blinker',
  // Databases
  'sqlalchemy', 'alembic', 'psycopg2', 'psycopg2-binary', 'pymysql',
  'mysqlclient', 'pymongo', 'motor', 'redis', 'elasticsearch', 'peewee',
  'asyncpg',
  // CLI & terminal
  'click', 'typer', 'rich', 'tqdm', 'colorama', 'termcolor', 'tabulate',
  'fire', 'prompt-toolkit',
  // Parsing & scraping
  'beautifulsoup4', 'lxml', 'html5lib', 'soupsieve', 'scrapy', 'selenium',
  'playwright', 'feedparser', 'markdown', 'pyyaml', 'toml', 'tomli',
  'jsonschema', 'xmltodict', 'regex', 'chardet',
  // Validation & serialization
  'pydantic', 'marshmallow', 'attrs', 'cattrs', 'orjson', 'ujson',
  'simplejson', 'msgpack', 'protobuf', 'grpcio',
  // Auth & crypto
  'cryptography', 'pyjwt', 'pyopenssl', 'paramiko', 'bcrypt', 'passlib',
  // Testing & QA
  'pytest', 'pytest-cov', 'pytest-asyncio', 'pytest-mock', 'tox', 'nox',
  'coverage', 'hypothesis', 'faker', 'factory-boy', 'mock', 'responses',
  'freezegun',
  // Linting & formatting
  'black', 'flake8', 'pylint', 'isort', 'mypy', 'ruff', 'autopep8', 'yapf',
  'bandit', 'pre-commit',
  // Docs
  'sphinx', 'mkdocs', 'mkdocs-material',
  // Date & time
  'python-dateutil', 'pytz', 'tzdata', 'arrow', 'pendulum', 'dateparser',
  'humanize', 'croniter',
  // Files & office
  'openpyxl', 'xlrd', 'xlsxwriter', 'python-docx', 'pypdf', 'pypdf2',
  'reportlab', 'pdfminer-six',
  // Cloud & APIs
  'boto3', 'botocore', 'awscli', 's3transfer', 'azure-storage-blob',
  'google-cloud-storage', 'google-api-python-client', 'firebase-admin',
  'stripe', 'twilio', 'sendgrid', 'slack-sdk', 'discord-py', 'tweepy',
  'kafka-python', 'pika', 'paho-mqtt',
  // Config & env
  'python-dotenv', 'environs', 'dynaconf', 'watchdog', 'schedule',
  'apscheduler', 'loguru', 'structlog', 'sentry-sdk', 'psutil',
  // Text & misc
  'python-slugify', 'unidecode', 'validators', 'phonenumbers',
  'email-validator', 'rapidfuzz', 'fuzzywuzzy', 'more-itertools',
  'cachetools', 'diskcache', 'dill', 'cloudpickle', 'jupyter', 'notebook',
  'jupyterlab', 'ipython', 'ipykernel', 'nbconvert',
]);
