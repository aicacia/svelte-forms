<script lang="ts">
	import * as v from 'valibot';
	import { createForm } from '$lib';
	import Issues from './_Issues.svelte';

	const form = createForm(
		v.object({
			email: v.pipe(v.string(), v.nonEmpty('Email is required')),
			password: v.pipe(
				v.string(),
				v.nonEmpty('Password is required'),
				v.minLength(1, 'Password must be at least 1 character long')
			)
		}),
		{
			email: '',
			password: ''
		}
	);

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();

		const [_input, output, error] = await form.validate();

		if (error) {
			return;
		}

		console.log(output);
	}
</script>

<form onsubmit={onSubmit} class="flex flex-col">
	<label class="flex flex-col">
		Username or Email
		<input
			type="text"
			aria-label="Username or Email"
			autocomplete="username"
			placeholder="Enter your username or email"
			bind:value={form.fields.email.value}
		/>
		<Issues issues={form.fields.email.issues} />
	</label>
	<label class="flex flex-col">
		Password
		<input
			aria-label="Password"
			type="password"
			autocomplete="current-password"
			placeholder="Enter your password"
			bind:value={form.fields.password.value}
		/>
		<Issues issues={form.fields.password.issues} />
	</label>
	<input class="btn primary mt-4" type="submit" value="Sign In" />
</form>
