# joi-to-typescript

[![NPM version][npm-image]][npm-url] ![Latest Build](https://github.com/mrjono1/joi-to-typescript/workflows/Node.js%20CI/badge.svg) ![NPM Release Build](https://github.com/mrjono1/joi-to-typescript/workflows/Node.js%20Package/badge.svg) ![GitHub top language](https://img.shields.io/github/languages/top/mrjono1/joi-to-typescript) [![codecov](https://codecov.io/gh/mrjono1/joi-to-typescript/branch/master/graph/badge.svg?token=7UtmWfj5cA)](https://codecov.io/gh/mrjono1/joi-to-typescript)

[joi-to-typescript on GitHub](https://github.com/mrjono1/joi-to-typescript)

[npm-image]: https://img.shields.io/npm/v/joi-to-typescript.svg?style=flat
[npm-url]: https://www.npmjs.com/package/joi-to-typescript

Convert [Joi](https://github.com/sideway/joi) Schemas to TypeScript interfaces

This will allow you to reuse a Joi Schema that validates your [Hapi](https://github.com/hapijs/hapi) API to generate TypeScript interfaces saving you time.

## Important

- This has been built for `"joi": "^17.2.1"` and will probaly not work for older versions, mainly due to package name changes
- Minimum node version 12 as Joi requries node 12

## Suggested Usage

1. Create a Schemas Folder eg. `src/schemas`
1. Create a interfaces Folder eg. `src/interfaces`
1. Create Joi Schemas in the Schemas folder with a file name suffix of Schemas eg. `AddressSchema.ts`
   - The file name suffix ensures that type file and schema file imports are not confusing

[Example Project](https://github.com/mrjono1/joi-to-typescript/tree/master/example)
The example project allows the use of `yarn types` or `npm run types` to run this package

## Example Usage

#### Example Schema in src/schemas

This example can be found in `src/__tests__/readme`

```typescript
import Joi from 'joi';

// Input
export const JobSchema = Joi.object({
  businessName: Joi.string().required(),
  jobTitle: Joi.string().required()
}).label('Job');

export const PersonSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string()
    .required()
    .description('Last Name'),
  job: JobSchema
}).label('Person');

export const PeopleSchema = Joi.array()
  .items(PersonSchema)
  .required()
  .label('People')
  .description('A list of People');

// Output
/**
 * This file was automatically generated by joi-to-typescript
 * Do not modify this file manually
 */

export interface Job {
  businessName: string;
  jobTitle: string;
}

/**
 * A list of People
 */
export type People = Person[];

/**
 * Person
 */
export interface Person {
  firstName: string;
  job?: Job;
  /**
   * Last Name
   */
  lastName: string;
}
```

##### Points of Interest

- `export const PersonSchema` schema must be exported
- `export const PersonSchema` schema includes a suffix of Schema
- `.label('Person');` Sets `interface` name using TypeScript conventions (TitleCase Interface name, camlCase property name)

#### Example Call

```typescript
import { convertFromDirectory } from 'joi-to-typescript';

convertFromDirectory({
  schemaDirectory: './src/schemas',
  typeOutputDirectory: './src/interfaces',
  debug: true
});
```

## Settings

```typescript
export interface Settings {
  /**
   * The input/schema directory
   * Directory must exist
   */
  schemaDirectory: string;
  /**
   * The output/type directory
   * Will also attempt to create this directory
   */
  typeOutputDirectory: string;
  /**
   * Should interface properties be defaulted to optional or required
   */
  defaultToRequired: boolean;
  /**
   * What schema file name suffix will be removed when creating the interface file name
   * Defaults to `Schema`
   * This ensures that an interface and Schema with the file name are not confused
   */
  schemaFileSuffix: string;
  /**
   * If `true` the console will include more information
   */
  debug: boolean;
  /**
   * File Header content for generated files
   */
  fileHeader: string;
  /**
   * If true will sort properties on interface by name
   * Defaults to `true`
   */
  sortPropertiesByName: boolean;
  /**
   * If true will not output to subDirectories in output/interface directory. It will flatten the structure.
   */
  flattenTree: boolean;
  /**
   * If true will only read the files in the root directory of the input/schema directory. Will not parse through sub-directories.
   */
  rootDirectoryOnly: boolean;
  /**
   * If true will write all exports *'s to root index.ts in output/interface directory.
   */
  indexAllToRoot: boolean;
  /**
   * Comment every interface and property even with just a duplicate of the interface and property name
   * Defaults to `false`
   */
  commentEverything: boolean;
}
```

## Joi Features Supported

- .label('InterfaceName') - interface Name and in jsDoc
- .description('What this interface is for') - jsdoc
- .valid(['red', 'green', 'blue']) - enumerations
- .optional() - optional properties `?`
- .requried() - required properties
- .array(), .object(), .string(), .number(), .boolean() - standard Joi schemas
- .alternatives()
- .allow('') - will be ignored on a string
- .allow(null) - will add as an optional type eg `string | null`
- .unknown(true) - will add a property `[x: string]: any;`

Joi Features not listed here will probably be ignored

## Contributing

Recommended Editor is VS Code
This project also many settings for this editor in the `./.vscode` directory

```bash
nvm use # using NVM to select node version
yarn install # using yarn
yarn test # run local tests

yarn coverage # test coverage report
yarn lint # lint the code
```
