import Joi from 'joi';
import { filterMap } from './utils';
import { TypeContent, makeTypeContentRoot, makeTypeContentChild, Settings } from './types';

export const supportedJoiTypes = ['array', 'object', 'alternatives', 'any', 'boolean', 'date', 'number', 'string'];
// unsupported: 'link'| 'binary' | 'symbol'

export interface BaseDescribe extends Joi.Description {
  flags?: {
    label?: string;
    description?: string;
    presence?: 'optional' | 'required';
    unknown?: boolean;
  };
}

export interface ArrayDescribe extends BaseDescribe {
  type: 'array';
  items: Describe[];
}

export interface ObjectDescribe extends BaseDescribe {
  type: 'object';
  keys: Record<'string', Describe>;
}

export interface AlternativesDescribe extends BaseDescribe {
  type: 'alternatives';
  matches: { schema: Describe }[];
}

export interface StringDescribe extends BaseDescribe {
  type: 'string';
  allow?: string[];
}

export interface BasicDescribe extends BaseDescribe {
  type: 'any' | 'boolean' | 'date' | 'number';
}

export type Describe = ArrayDescribe | BasicDescribe | ObjectDescribe | AlternativesDescribe | StringDescribe;

// Sometimes we know the type content will have name set
type TypeContentWithName = TypeContent & { name: string };

function getCommonDetails(
  details: Describe,
  settings: Settings
): { label?: string; description?: string; required: boolean } {
  const label = details.flags?.label;
  const description = details.flags?.description;
  const presence = details.flags?.presence;
  let required;
  if (presence === 'optional') {
    required = false;
  } else if (presence === 'required') {
    required = true;
  } else {
    required = settings.defaultToRequired;
  }
  return { label, description, required };
}

export function getAllCustomTypes(parsedSchema: TypeContent): string[] {
  if (parsedSchema.__isRoot) {
    return parsedSchema.children.flatMap(child => getAllCustomTypes(child));
  } else {
    return parsedSchema.customTypes || [];
  }
}

function getIndentStr(indentLevel: number): string {
  // TODO: configure size of a single level of indent
  // right now using 2 spaces
  return '  '.repeat(indentLevel);
}

/**
 * Get Interface jsDoc
 */
function getDescriptionStr(commentEverything: boolean, name: string, description?: string, indentLevel = 0): string {
  if (!commentEverything && !description) {
    return '';
  }
  const docStr = description ? description : name;
  const lines = ['/**', ` * ${docStr}`, ' */'];
  return lines.map(line => `${getIndentStr(indentLevel)}${line}`).join('\n') + '\n';
}

function typeContentToTsHelper(
  commentEverything: boolean,
  parsedSchema: TypeContent,
  doExport = false,
  indentLevel = 0
): { tsContent: string; description?: string } {
  if (!parsedSchema.__isRoot) {
    return { tsContent: parsedSchema.content, description: parsedSchema.description };
  }

  const children = parsedSchema.children;
  if (doExport && !parsedSchema.name) {
    throw new Error(`Type ${JSON.stringify(parsedSchema)} needs a name to be exported`);
  }
  switch (parsedSchema.joinOperation) {
    case 'list': {
      const childrenContent = children.map(child => typeContentToTsHelper(commentEverything, child));
      if (childrenContent.length > 1) {
        throw new Error('Multiple array item types not supported');
      }
      let content = childrenContent[0].tsContent;
      if (content.includes('|')) {
        // TODO: might need a better way to add the parens for union
        content = `(${content})`;
      }
      const arrayStr = `${content}[]`;
      if (doExport) {
        return { tsContent: `export type ${parsedSchema.name} = ${arrayStr};`, description: parsedSchema.description };
      }
      return { tsContent: arrayStr, description: parsedSchema.description };
    }
    case 'union': {
      const childrenContent = children.map(child => typeContentToTsHelper(commentEverything, child).tsContent);
      const unionStr = childrenContent.join(' | ');
      if (doExport) {
        return { tsContent: `export type ${parsedSchema.name} = ${unionStr};`, description: parsedSchema.description };
      }
      return { tsContent: unionStr, description: parsedSchema.description };
    }
    case 'object': {
      if (!children.length && !doExport) {
        return { tsContent: 'object', description: parsedSchema.description };
      }

      // interface can have no properties {} if the joi object has none defined
      let objectStr = '{}';

      if (children.length !== 0) {
        const childrenContent = children.map(child => {
          const childInfo = typeContentToTsHelper(commentEverything, child, false, indentLevel + 1);
          // TODO: configure indent length
          // forcing name to be defined here, might need a runtime check but it should be set if we are here
          const descriptionStr = getDescriptionStr(
            commentEverything,
            child.name as string,
            childInfo.description,
            indentLevel + 1
          );
          const optionalStr = child.required ? '' : '?';
          return `${descriptionStr}  ${getIndentStr(indentLevel)}${child.name}${optionalStr}: ${childInfo.tsContent};`;
        });
        objectStr = `{\n${childrenContent.join('\n')}\n${getIndentStr(indentLevel)}}`;
      }
      if (doExport) {
        return {
          tsContent: `export interface ${parsedSchema.name} ${objectStr}`,
          description: parsedSchema.description
        };
      }
      return { tsContent: objectStr, description: parsedSchema.description };
    }
    default:
      throw new Error(`Unsupported join operation ${parsedSchema.joinOperation}`);
  }
}

export function typeContentToTs(commentEverything: boolean, parsedSchema: TypeContent, doExport = false): string {
  const { tsContent, description } = typeContentToTsHelper(commentEverything, parsedSchema, doExport);
  // forcing name to be defined here, might need a runtime check but it should be set if we are here
  const descriptionStr = getDescriptionStr(commentEverything, parsedSchema.name as string, description);
  return `${descriptionStr}${tsContent}`;
}

// TODO: will be issues with useLabels if a nested schema has a label but is not exported on its own

// TODO: will need to pass around ignoreLabels more
/**
 * Parses a joi schema into a TypeContent
 * @param details: the joi schema
 * @param Settings: settings used for parsing
 * @param useLabels if true and if a schema has a label we won't parse it and instead just reference the label in the outputted type
 * @param ignoreLabels a list a label to ignore if found. Sometimes nested joi schemas will inherit the parents label so we want to ignore that
 */
export function parseSchema(
  details: Describe,
  settings: Settings,
  useLabels = true,
  ignoreLabels: string[] = []
): TypeContent | undefined {
  function parseHelper(): TypeContent | undefined {
    switch (details.type) {
      case 'array':
        return parseArray(details, settings);
      case 'string':
        return parseStringSchema(details, settings);
      case 'alternatives':
        return parseAlternatives(details, settings);
      case 'object':
        return parseObjects(details, settings);
      default:
        return parseBasicSchema(details, settings);
    }
  }
  const { label, description, required } = getCommonDetails(details, settings);
  if (label && useLabels && !ignoreLabels.includes(label)) {
    // skip parsing and just reference the label since we assumed we parsed the schema that the label references
    // TODO: do we want to use the labels description if we reference it?
    return makeTypeContentChild({ content: label, customTypes: [label], description, required });
  }
  if (!supportedJoiTypes.includes(details.type)) {
    // TODO: debug/better error logging
    // TODO: maybe just make it any?
    console.log(`unsupported type: ${details.type}`);
    return undefined;
  }
  const parsedSchema = parseHelper();
  if (!parsedSchema) {
    return undefined;
  }
  parsedSchema.name = label;
  parsedSchema.description = description;
  parsedSchema.required = required;
  return parsedSchema;
}

function parseBasicSchema(details: BasicDescribe, settings: Settings): TypeContent | undefined {
  const { label: name, description } = getCommonDetails(details, settings);

  const joiType = details.type;
  let content = joiType as string;
  if (joiType === 'date') {
    content = 'Date';
  }
  const values = details.allow;

  // at least one value
  if (values && values.length !== 0) {
    const allowedValues = values.map((value: unknown) =>
      makeTypeContentChild({ content: typeof value === 'string' ? `'${value}'` : `${value}` })
    );

    if (values[0] === null) {
      allowedValues.unshift(makeTypeContentChild({ content }));
    }
    return makeTypeContentRoot({ joinOperation: 'union', children: allowedValues, name, description });
  }

  return makeTypeContentChild({ content, name, description });
}

function parseStringSchema(details: StringDescribe, settings: Settings): TypeContent | undefined {
  const { label: name, description } = getCommonDetails(details, settings);
  const values = details.allow;
  const stringAllowValues = [null, ''];

  // at least one value
  if (values && values.length !== 0) {
    if (values.length === 1 && values[0] === '') {
      // special case of empty string sometimes used in Joi to allow just empty string
    } else {
      const allowedValues = values.map(value =>
        stringAllowValues.includes(value) && value !== ''
          ? makeTypeContentChild({ content: `${value}` })
          : makeTypeContentChild({ content: `'${value}'` })
      );

      if (values.filter(value => stringAllowValues.includes(value)).length == values.length) {
        allowedValues.unshift(makeTypeContentChild({ content: 'string' }));
      }
      return makeTypeContentRoot({ joinOperation: 'union', children: allowedValues, name, description });
    }
  }

  return makeTypeContentChild({ content: 'string', name, description });
}

function parseArray(details: ArrayDescribe, settings: Settings): TypeContent | undefined {
  // TODO: handle multiple things in the items arr
  const item = details.items ? details.items[0] : ({ type: 'any' } as Describe);
  const { label: name, description } = getCommonDetails(details, settings);

  const child = parseSchema(item, settings);
  return child ? makeTypeContentRoot({ joinOperation: 'list', children: [child], name, description }) : undefined;
}

function parseAlternatives(details: AlternativesDescribe, settings: Settings): TypeContent | undefined {
  const { label, description } = getCommonDetails(details, settings);
  const ignoreLabels = label ? [label] : [];
  const children = filterMap(details.matches, match => {
    return parseSchema(match.schema, settings, true, ignoreLabels);
  });
  // This is an check that cannot be tested as Joi throws an error before this package
  // can be called, there is test for it in alternatives
  if (children.length === 0) {
    /* istanbul ignore next */
    return undefined;
  }

  return makeTypeContentRoot({ joinOperation: 'union', children, name: label, description });
}

function parseObjects(details: ObjectDescribe, settings: Settings): TypeContent | undefined {
  let children = filterMap(Object.entries(details.keys || {}), ([key, value]) => {
    const parsedSchema = parseSchema(value, settings);
    // The only type that could return this is alternatives
    // see parseAlternatives for why this is ignored
    if (!parsedSchema) {
      /* istanbul ignore next */
      return undefined;
    }
    parsedSchema.name = /^[$A-Z_][0-9A-Z_$]*$/i.test(key || '') ? key : `'${key}'`;
    return parsedSchema as TypeContentWithName;
  });

  if (details?.flags?.unknown === true) {
    const unknownProperty = {
      content: 'any',
      name: '[x: string]',
      required: true,
      description: 'Unknown Property'
    } as TypeContentWithName;
    children.push(unknownProperty);
  }

  if (settings.sortPropertiesByName) {
    children = children.sort((a, b) => {
      if (a.name > b.name) {
        return 1;
      } else if (a.name < b.name) {
        return -1;
      }
      // this next line can never happen as the object is totally invalid as the object is invalid
      // the code would not build so ignoring this
      /* istanbul ignore next */
      return 0;
    });
  }
  const { label: name, description } = getCommonDetails(details, settings);
  return makeTypeContentRoot({ joinOperation: 'object', children, name, description });
}
