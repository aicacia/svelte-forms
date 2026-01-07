<script lang="ts">
	import * as v from 'valibot';
	import { createField, createForm } from '$lib';
	import Issues from './_Issues.svelte';

	const addressSchema = v.object({
		label: v.pipe(v.string(), v.nonEmpty('Label is required')),
		street: v.pipe(v.string(), v.nonEmpty('Street is required')),
		city: v.pipe(v.string(), v.nonEmpty('City is required')),
		country: v.pipe(v.string(), v.nonEmpty('Country is required'))
	});

	const tagSchema = v.pipe(v.string(), v.nonEmpty('Tag cannot be empty'));

	const form = createForm(
		v.object({
			profile: v.object({
				name: v.pipe(v.string(), v.nonEmpty('Name is required')),
				email: v.pipe(v.string(), v.email('Enter a valid email')),
				role: v.pipe(v.string(), v.nonEmpty('Role is required'))
			}),
			addresses: v.pipe(v.array(addressSchema), v.minLength(1, 'Add at least one address')),
			tags: v.pipe(v.array(tagSchema), v.minLength(1, 'Add at least one tag'))
		}),
		{
			profile: {
				name: 'Ada Lovelace',
				email: 'ada@example.com',
				role: 'Engineer'
			},
			addresses: [
				{
					label: 'Home',
					street: '123 Logic Gate Ave',
					city: 'Analytica',
					country: 'UK'
				}
			],
			tags: ['priority']
		}
	);

	function addAddress() {
		form.fields.addresses.items.push(
			createField(addressSchema, {
				label: '',
				street: '',
				city: '',
				country: ''
			})
		);
	}

	function removeAddress(index: number) {
		form.fields.addresses.items.splice(index, 1);
	}

	function addTag() {
		form.fields.tags.items.push(createField(tagSchema, ''));
	}

	function removeTag(index: number) {
		form.fields.tags.items.splice(index, 1);
	}

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();

		const [_input, output, error] = await form.validate();

		if (error) {
			return;
		}

		console.log(output);
	}

	function onReset() {
		form.reset();
	}
</script>

<form onsubmit={onSubmit} class="flex flex-col gap-6">
	<div class="flex items-center justify-between">
		<h4>Profile</h4>
	</div>

	<section class="grid gap-4 md:grid-cols-2">
		<div class="flex flex-col">
			<label class="flex flex-col gap-1">
				Name
				<input
					placeholder="Ada Lovelace"
					autocomplete="name"
					bind:value={form.fields.profile.fields.name.value}
				/>
			</label>
			<Issues issues={form.fields.profile.fields.name.issues} />
		</div>

		<div class="flex flex-col">
			<label class="flex flex-col gap-1">
				Email
				<input
					type="email"
					autocomplete="email"
					placeholder="ada@example.com"
					bind:value={form.fields.profile.fields.email.value}
				/>
			</label>
			<Issues issues={form.fields.profile.fields.email.issues} />
		</div>

		<div class="flex flex-col">
			<label class="flex flex-col gap-1">
				Role
				<input
					placeholder="Engineer"
					autocomplete="organization-title"
					bind:value={form.fields.profile.fields.role.value}
				/>
			</label>
			<Issues issues={form.fields.profile.fields.role.issues} />
		</div>
	</section>

	<hr />

	<section class="flex flex-col gap-4">
		<div class="flex items-center justify-between">
			<h4>Addresses</h4>
		</div>
		{#each form.fields.addresses.items as address, index}
			<div>
				<p>{address.fields.label.value || 'Address'} #{index + 1}</p>
				<div class="mt-2 grid gap-4 md:grid-cols-2">
					<label class="flex flex-col gap-1">
						Label
						<input placeholder="Home" bind:value={address.fields.label.value} />
						<Issues issues={address.fields.label.issues} />
					</label>

					<label class="flex flex-col gap-1">
						Street
						<input placeholder="123 Logic Gate Ave" bind:value={address.fields.street.value} />
						<Issues issues={address.fields.street.issues} />
					</label>

					<label class="flex flex-col gap-1">
						City
						<input placeholder="Analytica" bind:value={address.fields.city.value} />
						<Issues issues={address.fields.city.issues} />
					</label>

					<label class="flex flex-col gap-1">
						Country
						<input placeholder="UK" bind:value={address.fields.country.value} />
						<Issues issues={address.fields.country.issues} />
					</label>
				</div>
				<div class="mt-2 flex justify-end">
					<button type="button" class="btn danger" onclick={() => removeAddress(index)}>
						Remove
					</button>
				</div>
			</div>
		{/each}
		<div class="flex items-center justify-center">
			<button type="button" class="btn success" onclick={addAddress}> Add Address </button>
		</div>
		<Issues issues={form.fields.addresses.issues} />
	</section>

	<hr />

	<section class="flex flex-col gap-3">
		<div class="flex items-center">
			<h4>Tags</h4>
		</div>
		{#each form.fields.tags.items as tag, index}
			<div class="flex items-center gap-2">
				<input class="flex-1" placeholder="priority" bind:value={tag.value} />
				<button type="button" class="btn danger" onclick={() => removeTag(index)}> Remove </button>
			</div>
			<Issues issues={tag.issues} />
		{/each}
		<div class="flex items-center justify-center">
			<button type="button" class="btn success" onclick={addTag}> Add Tag </button>
		</div>
		<Issues issues={form.fields.tags.issues} />
	</section>

	<div class="flex gap-3">
		<input class="btn primary" type="submit" value="Save Profile" />
		<button type="button" class="btn" onclick={onReset}> Reset </button>
	</div>
</form>
