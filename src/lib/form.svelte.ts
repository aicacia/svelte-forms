import {
	parseAsync,
	ValiError,
	type ArraySchema,
	type ArrayIssue,
	type ErrorMessage,
	type InferInput,
	type InferOutput,
	type InferIssue,
	type ObjectEntries,
	type ObjectIssue,
	type ObjectSchema,
	type BaseSchema,
	type BaseIssue
} from 'valibot';
import { debounce } from '@aicacia/debounce';

export type FieldState = 'validating' | 'valid' | 'invalid' | 'unset' | 'set';

export type ValidationOk<V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>> = [
	input: InferInput<V>,
	output: InferOutput<V>,
	error: undefined
];
export type ValidationErr<V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>> = [
	input: InferInput<V>,
	output: undefined,
	error: ValiError<V>
];
export type ValidationResult<V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>> =
	| ValidationOk<V>
	| ValidationErr<V>;

export interface CommonField<V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>> {
	readonly issues: InferIssue<V>[];
	readonly state: FieldState;
	reset(newInitialValue?: InferInput<V>): void;
	validate(): Promise<ValidationResult<V>>;
}

export interface PrimitiveField<
	V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>
> extends CommonField<V> {
	get value(): InferOutput<V> | undefined;
	set value(newValue: InferInput<V> | undefined);
}

export interface ArrayField<
	V extends ArraySchema<
		BaseSchema<unknown, unknown, BaseIssue<unknown>>,
		ErrorMessage<ArrayIssue> | undefined
	>
> extends CommonField<V> {
	readonly items: Field<V['item']>[];
}

export interface ObjectField<
	V extends ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>
> extends CommonField<V> {
	readonly fields: { [K in keyof V['entries']]: Field<V['entries'][K]> };
}

export type Field<V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>> =
	V extends ArraySchema<
		BaseSchema<unknown, unknown, BaseIssue<unknown>>,
		ErrorMessage<ArrayIssue> | undefined
	>
		? ArrayField<V>
		: V extends ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>
			? ObjectField<V>
			: PrimitiveField<V>;

export interface Config {
	debounceMS?: number;
}

function createObjectField<
	V extends ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>
>(schema: V, initialValue: InferInput<V> = {}, { debounceMS = 300 }: Config): ObjectField<V> {
	let state = $state<FieldState>('unset');
	const fields = $state({} as { [K in keyof V['entries']]: Field<V['entries'][K]> });
	const issues = $state<InferIssue<V>[]>([]);

	for (const [fieldName, fieldSchema] of Object.entries(schema.entries) as [
		keyof V['entries'],
		V['entries'][keyof V['entries']]
	][]) {
		fields[fieldName] = createField(fieldSchema, initialValue[fieldName as keyof InferInput<V>], {
			debounceMS
		}) as Field<V['entries'][typeof fieldName]>;
	}

	async function validate(): Promise<ValidationResult<V>> {
		const fieldInputs = {} as InferInput<V>;
		const fieldOutputs = {} as InferOutput<V>;
		const fieldIssues: InferIssue<V>[] = [];

		try {
			state = 'validating';

			await Promise.all(
				Object.entries(fields).map(async ([key, field]) => {
					const fieldName = key as keyof V['entries'];
					const [fieldInput, fieldOutput, fieldError]: [
						fieldInput: InferInput<V['entries'][typeof fieldName]>,
						fieldOutput: InferOutput<V['entries'][typeof fieldName]>,
						fieldError: ValiError<V['entries'][typeof fieldName]> | undefined
					] = await field.validate();

					fieldInputs[fieldName as keyof InferInput<V>] = fieldInput;

					if (fieldError) {
						for (const fieldIssue of fieldError.issues) {
							if (fieldIssue.path) {
								fieldIssue.path.unshift(fieldName as never);
							}
							fieldIssues.push(fieldIssue as InferIssue<V>);
						}
					} else {
						fieldOutputs[fieldName as keyof InferOutput<V>] = fieldOutput;
					}
				})
			);

			if (fieldIssues.length > 0) {
				state = 'invalid';
				issues.length = 0;
				issues.push(...fieldIssues);
				return [
					fieldInputs,
					undefined,
					new ValiError<V>(fieldIssues as [InferIssue<V>, ...InferIssue<V>[]])
				];
			}

			const output = await parseAsync(schema, fieldInputs as unknown as InferInput<V>);
			state = 'valid';
			issues.length = 0;
			return [fieldInputs, output, undefined];
		} catch (e) {
			state = 'invalid';
			issues.length = 0;
			if (e instanceof ValiError) {
				issues.push(...(e.issues as InferIssue<V>[]));
				return [
					fieldInputs,
					undefined,
					new ValiError<V>(e.issues as [InferIssue<V>, ...InferIssue<V>[]])
				];
			}
			throw e;
		}
	}

	function reset(newInitialValue?: InferInput<V>) {
		for (const [fieldName, field] of Object.entries(fields)) {
			field.reset(
				newInitialValue?.[fieldName as keyof InferInput<V>] ??
					initialValue[fieldName as keyof InferInput<V>]
			);
		}
		state = 'unset';
		issues.length = 0;
	}

	return {
		get fields() {
			return fields;
		},
		get state() {
			return state;
		},
		get issues() {
			return issues;
		},
		validate,
		reset
	};
}

function createArrayField<
	V extends ArraySchema<
		BaseSchema<unknown, unknown, BaseIssue<unknown>>,
		ErrorMessage<ArrayIssue> | undefined
	>
>(schema: V, initialValue: InferInput<V> = [], { debounceMS = 300 }: Config): ArrayField<V> {
	let state = $state<FieldState>('unset');
	const items = $state(
		initialValue.map((itemValue) => createField(schema.item, itemValue, { debounceMS })) as Field<
			V['item']
		>[]
	);
	const issues = $state<InferIssue<V>[]>([]);

	async function validate(): Promise<ValidationResult<V>> {
		const itemsInput = [] as InferInput<V>;
		const itemsOutput = [] as InferOutput<V>;
		const itemsIssues: InferIssue<V>[] = [];

		try {
			state = 'validating';

			await Promise.all(
				items.map(async (itemField, index) => {
					const [itemInput, itemOutput, itemError] = await itemField.validate();

					itemsInput[index] = itemInput;

					if (itemError) {
						for (const itemIssue of itemError.issues) {
							if (itemIssue.path) {
								itemIssue.path.unshift(index as never);
							}
							itemsIssues.push(itemIssue as InferIssue<V>);
						}
					} else {
						itemsOutput[index] = itemOutput;
					}
				})
			);

			if (itemsIssues.length > 0) {
				state = 'invalid';
				issues.length = 0;
				issues.push(...itemsIssues);
				return [
					itemsInput,
					undefined,
					new ValiError<V>(itemsIssues as [InferIssue<V>, ...InferIssue<V>[]])
				];
			}

			const output = await parseAsync(schema, itemsInput as unknown as InferInput<V>);
			state = 'valid';
			issues.length = 0;
			return [itemsInput, output, undefined];
		} catch (e) {
			state = 'invalid';
			issues.length = 0;
			if (e instanceof ValiError) {
				issues.push(...(e.issues as InferIssue<V>[]));
				return [
					itemsInput,
					undefined,
					new ValiError<V>(e.issues as [InferIssue<V>, ...InferIssue<V>[]])
				];
			}
			throw e;
		}
	}

	function reset(newInitialValue?: InferInput<V>) {
		const initialValues = newInitialValue ?? initialValue;
		items.length = initialValues.length;
		for (let i = 0; i < items.length; i++) {
			const field = items[i];
			if (field) {
				field.reset(initialValues[i] as never);
			} else {
				items[i] = createField(schema.item, initialValues[i], { debounceMS }) as Field<V['item']>;
			}
		}
		state = 'unset';
		issues.length = 0;
	}

	return {
		get items() {
			return items;
		},
		get state() {
			return state;
		},
		get issues() {
			return issues;
		},
		validate,
		reset
	};
}

function createPrimitiveField<V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(
	schema: V,
	initialValue: InferInput<V> = undefined,
	debounceMS = 300
): PrimitiveField<V> {
	let state = $state<FieldState>('unset');
	let input = $state<InferInput<V>>(initialValue);
	let output = $state<InferOutput<V>>(initialValue);
	const issues = $state<InferIssue<V>[]>([]);

	async function validate(): Promise<ValidationResult<V>> {
		try {
			state = 'validating';
			output = await parseAsync(schema, input);
			state = 'valid';
			issues.length = 0;
			return [input, output, undefined];
		} catch (e) {
			state = 'invalid';
			output = input;
			issues.length = 0;
			if (e instanceof ValiError) {
				issues.push(...e.issues);
				return [input, undefined, e as ValiError<V>];
			}
			throw e;
		}
	}
	const debounceValidate = debounce(validate, debounceMS);

	function reset(newInitialValue?: InferInput<V>) {
		state = 'unset';
		input = newInitialValue ?? initialValue;
		issues.length = 0;
	}

	return {
		get state() {
			return state;
		},
		get value() {
			return output;
		},
		set value(newValue: InferInput<V> | undefined) {
			state = 'set';
			input = newValue;
			output = newValue;
			void debounceValidate();
		},
		get issues() {
			return issues;
		},
		validate,
		reset
	};
}

export function createField<V extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(
	schema: V,
	initialValue: InferInput<V> = undefined,
	{ debounceMS = 300 }: Config = {}
): Field<V> {
	if (schema.type === 'object') {
		return createObjectField(
			schema as V & ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>,
			initialValue as InferInput<
				V & ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>
			>,
			{ debounceMS }
		) as Field<V>;
	}
	if (schema.type === 'array') {
		return createArrayField(
			schema as V &
				ArraySchema<
					BaseSchema<unknown, unknown, BaseIssue<unknown>>,
					ErrorMessage<ArrayIssue> | undefined
				>,
			initialValue as InferInput<
				V &
					ArraySchema<
						BaseSchema<unknown, unknown, BaseIssue<unknown>>,
						ErrorMessage<ArrayIssue> | undefined
					>
			>,
			{ debounceMS }
		) as Field<V>;
	}
	return createPrimitiveField(schema, initialValue, debounceMS) as Field<V>;
}

export function createForm<
	V extends ObjectSchema<ObjectEntries, ErrorMessage<ObjectIssue> | undefined>
>(schema: V, initialValue: InferInput<V> = {}, { debounceMS = 300 }: Config = {}) {
	return createObjectField(schema, initialValue, { debounceMS });
}
