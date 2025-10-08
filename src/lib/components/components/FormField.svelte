<script lang="ts">
	export let label: string = '';
	export let type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'textarea' | 'select' = 'text';
	export let placeholder: string = '';
	export let value: string | number = '';
	export let required: boolean = false;
	export let disabled: boolean = false;
	export let readonly: boolean = false;
	export let error: string = '';
	export let helpText: string = '';
	export let id: string = '';
	export let name: string = '';
	export let rows: number = 4; // For textarea
	export let options: Array<{label: string, value: string | number}> = []; // For select
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let fullWidth: boolean = true;
	export let variant: 'default' | 'minimal' | 'bordered' = 'default';

	// Generate unique ID if not provided
import { createEventDispatcher } from 'svelte';

const dispatch = createEventDispatcher();
const fieldId = id || `field-${Math.random().toString(36).slice(2, 11)}`;

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		value = target.value;
		dispatch('input', { value, event });
	}

	function handleChange(event: Event) {
		const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		value = target.value;
		dispatch('change', { value, event });
	}

	function handleBlur(event: FocusEvent) {
		dispatch('blur', { value, event });
	}

	function handleFocus(event: FocusEvent) {
		dispatch('focus', { value, event });
	}
	
	// Tailwind class mappings
const sizeClasses = {
	small: 'px-3 py-2 text-sm',
	medium: 'px-4 py-3 text-base',
	large: 'px-5 py-4 text-lg'
};

const variantClasses = {
	default: 'border border-light-gray bg-white focus:border-primary focus:ring-1 focus:ring-primary',
	minimal: 'border-0 border-b border-light-gray bg-transparent focus:border-primary rounded-none',
	bordered: 'border-2 border-black bg-white focus:border-primary'
};

const labelClasses = 'block font-semibold text-black text-sm mb-2 uppercase tracking-wide';
const helpTextClasses = 'text-xs text-black opacity-60 mt-1';
const errorTextClasses = 'text-xs text-red-600 mt-1';
const requiredAsteriskClasses = 'text-red-500 ml-1';
const fieldWrapperClasses = 'relative';

function classNames(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(' ');
}

function containerClass() {
	return classNames('flex flex-col mb-4', fullWidth && 'w-full', disabled && 'opacity-60 pointer-events-none');
}

function inputClass() {
	return classNames(
		'w-full font-figtree font-medium transition-all duration-200 outline-none',
		sizeClasses[size],
		variantClasses[variant],
		error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
		disabled && 'bg-gray-100 cursor-not-allowed'
	);
}
</script>

<div class={containerClass()}>
	{#if label}
		<label for={fieldId} class={labelClasses}>
			{label}
			{#if required}
				<span class={requiredAsteriskClasses}>*</span>
			{/if}
		</label>
	{/if}

	<div class={fieldWrapperClasses}>
		{#if type === 'textarea'}
			<textarea
				{...$$restProps}
				id={fieldId}
				{name}
				{placeholder}
				{required}
				{disabled}
				{readonly}
				{rows}
				bind:value
				class={`${inputClass()} resize-vertical`}
				on:input={handleInput}
				on:change={handleChange}
				on:blur={handleBlur}
				on:focus={handleFocus}
			></textarea>
		{:else if type === 'select'}
			<select
				{...$$restProps}
				id={fieldId}
				{name}
				{required}
				{disabled}
				bind:value
				class={inputClass()}
				on:change={handleChange}
				on:blur={handleBlur}
				on:focus={handleFocus}
			>
				{#if placeholder}
					<option value="" disabled>{placeholder}</option>
				{/if}
				{#each options as option (option.value)}
					<option value={option.value}>
						{option.label}
					</option>
				{/each}
			</select>
		{:else}
			<input
				{...$$restProps}
				{type}
				id={fieldId}
				{name}
				{placeholder}
				{required}
				{disabled}
				{readonly}
				bind:value
				class={inputClass()}
				on:input={handleInput}
				on:change={handleChange}
				on:blur={handleBlur}
				on:focus={handleFocus}
			/>
		{/if}
	</div>

	{#if helpText && !error}
		<div class={helpTextClasses}>{helpText}</div>
	{/if}

	{#if error}
		<div class={errorTextClasses} role="alert">{error}</div>
	{/if}
</div>
