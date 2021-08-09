var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src\App.svelte generated by Svelte v3.42.1 */

    function create_fragment(ctx) {
    	let main;
    	let form;
    	let legend;
    	let t1;
    	let div0;
    	let label0;
    	let t3;
    	let input0;
    	let t4;
    	let div2;
    	let div1;
    	let label1;
    	let t6;
    	let input1;
    	let t7;
    	let output0;
    	let t8;
    	let t9_value = (/*years*/ ctx[1] === 1 ? ' year' : ' years') + "";
    	let t9;
    	let t10;
    	let div4;
    	let div3;
    	let label2;
    	let t12;
    	let input2;
    	let t13;
    	let output1;
    	let t14_value = /*interestRate*/ ctx[5].toFixed(2) + "";
    	let t14;
    	let t15;
    	let t16;
    	let output2;
    	let t17;
    	let t18_value = /*USDollar*/ ctx[7].format(/*monthlyPayment*/ ctx[4]) + "";
    	let t18;
    	let t19;
    	let output3;
    	let t20;
    	let t21_value = /*USDollar*/ ctx[7].format(/*totalPayments*/ ctx[3]) + "";
    	let t21;
    	let t22;
    	let output4;
    	let t23;
    	let t24_value = /*USDollar*/ ctx[7].format(/*interestPaid*/ ctx[6]) + "";
    	let t24;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			main = element("main");
    			form = element("form");
    			legend = element("legend");
    			legend.innerHTML = `<h1 class="svelte-1ob7sxf">Svelte Mortgage Calculator</h1>`;
    			t1 = space();
    			div0 = element("div");
    			label0 = element("label");
    			label0.textContent = "Loan Amount";
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			div2 = element("div");
    			div1 = element("div");
    			label1 = element("label");
    			label1.textContent = "Years";
    			t6 = space();
    			input1 = element("input");
    			t7 = space();
    			output0 = element("output");
    			t8 = text(/*years*/ ctx[1]);
    			t9 = text(t9_value);
    			t10 = space();
    			div4 = element("div");
    			div3 = element("div");
    			label2 = element("label");
    			label2.textContent = "Interests Rate";
    			t12 = space();
    			input2 = element("input");
    			t13 = space();
    			output1 = element("output");
    			t14 = text(t14_value);
    			t15 = text("%");
    			t16 = space();
    			output2 = element("output");
    			t17 = text("Monthly Payment: ");
    			t18 = text(t18_value);
    			t19 = space();
    			output3 = element("output");
    			t20 = text("Total Payment: ");
    			t21 = text(t21_value);
    			t22 = space();
    			output4 = element("output");
    			t23 = text("Interest Paid: ");
    			t24 = text(t24_value);
    			attr(legend, "class", "row");
    			attr(label0, "for", "amount");
    			attr(input0, "name", "amount");
    			attr(input0, "type", "number");
    			attr(input0, "min", "1");
    			attr(input0, "max", "999999999");
    			attr(input0, "placeholder", "Enter loan amount");
    			attr(input0, "class", "u-full-width");
    			attr(div0, "class", "row");
    			attr(label1, "for", "years");
    			attr(input1, "name", "years");
    			attr(input1, "type", "range");
    			attr(input1, "min", "1");
    			attr(input1, "max", "100");
    			attr(input1, "steps", "1");
    			attr(input1, "class", "u-full-width svelte-1ob7sxf");
    			attr(div1, "class", "columns seven");
    			attr(output0, "class", "columns five svelte-1ob7sxf");
    			attr(div2, "class", "row");
    			attr(label2, "for", "interest");
    			attr(input2, "name", "interest");
    			attr(input2, "type", "range");
    			attr(input2, "min", "1");
    			attr(input2, "max", "2000");
    			attr(input2, "steps", "1");
    			attr(input2, "class", "u-full-width svelte-1ob7sxf");
    			attr(div3, "class", "columns seven");
    			attr(output1, "class", "columns five svelte-1ob7sxf");
    			attr(div4, "class", "row");
    			attr(form, "class", "container");
    			attr(output2, "class", "row svelte-1ob7sxf");
    			attr(output3, "class", "row svelte-1ob7sxf");
    			attr(output4, "class", "row svelte-1ob7sxf");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, form);
    			append(form, legend);
    			append(form, t1);
    			append(form, div0);
    			append(div0, label0);
    			append(div0, t3);
    			append(div0, input0);
    			set_input_value(input0, /*amount*/ ctx[0]);
    			append(form, t4);
    			append(form, div2);
    			append(div2, div1);
    			append(div1, label1);
    			append(div1, t6);
    			append(div1, input1);
    			set_input_value(input1, /*years*/ ctx[1]);
    			append(div2, t7);
    			append(div2, output0);
    			append(output0, t8);
    			append(output0, t9);
    			append(form, t10);
    			append(form, div4);
    			append(div4, div3);
    			append(div3, label2);
    			append(div3, t12);
    			append(div3, input2);
    			set_input_value(input2, /*interest*/ ctx[2]);
    			append(div4, t13);
    			append(div4, output1);
    			append(output1, t14);
    			append(output1, t15);
    			append(main, t16);
    			append(main, output2);
    			append(output2, t17);
    			append(output2, t18);
    			append(main, t19);
    			append(main, output3);
    			append(output3, t20);
    			append(output3, t21);
    			append(main, t22);
    			append(main, output4);
    			append(output4, t23);
    			append(output4, t24);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[10]),
    					listen(input1, "change", /*input1_change_input_handler*/ ctx[11]),
    					listen(input1, "input", /*input1_change_input_handler*/ ctx[11]),
    					listen(input2, "change", /*input2_change_input_handler*/ ctx[12]),
    					listen(input2, "input", /*input2_change_input_handler*/ ctx[12])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*amount*/ 1 && to_number(input0.value) !== /*amount*/ ctx[0]) {
    				set_input_value(input0, /*amount*/ ctx[0]);
    			}

    			if (dirty & /*years*/ 2) {
    				set_input_value(input1, /*years*/ ctx[1]);
    			}

    			if (dirty & /*years*/ 2) set_data(t8, /*years*/ ctx[1]);
    			if (dirty & /*years*/ 2 && t9_value !== (t9_value = (/*years*/ ctx[1] === 1 ? ' year' : ' years') + "")) set_data(t9, t9_value);

    			if (dirty & /*interest*/ 4) {
    				set_input_value(input2, /*interest*/ ctx[2]);
    			}

    			if (dirty & /*interestRate*/ 32 && t14_value !== (t14_value = /*interestRate*/ ctx[5].toFixed(2) + "")) set_data(t14, t14_value);
    			if (dirty & /*monthlyPayment*/ 16 && t18_value !== (t18_value = /*USDollar*/ ctx[7].format(/*monthlyPayment*/ ctx[4]) + "")) set_data(t18, t18_value);
    			if (dirty & /*totalPayments*/ 8 && t21_value !== (t21_value = /*USDollar*/ ctx[7].format(/*totalPayments*/ ctx[3]) + "")) set_data(t21, t21_value);
    			if (dirty & /*interestPaid*/ 64 && t24_value !== (t24_value = /*USDollar*/ ctx[7].format(/*interestPaid*/ ctx[6]) + "")) set_data(t24, t24_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(main);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let interestRate;
    	let totalPayments;
    	let monthlyInterestRate;
    	let monthlyPayment;
    	let totalPaid;
    	let interestPaid;
    	const USDollar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    	let amount = 200_000;
    	let years = 15;
    	let interest = 300;

    	function input0_input_handler() {
    		amount = to_number(this.value);
    		$$invalidate(0, amount);
    	}

    	function input1_change_input_handler() {
    		years = to_number(this.value);
    		$$invalidate(1, years);
    	}

    	function input2_change_input_handler() {
    		interest = to_number(this.value);
    		$$invalidate(2, interest);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*interest*/ 4) {
    			$$invalidate(5, interestRate = interest / 20);
    		}

    		if ($$self.$$.dirty & /*years*/ 2) {
    			$$invalidate(3, totalPayments = years * 12);
    		}

    		if ($$self.$$.dirty & /*interestRate*/ 32) {
    			$$invalidate(9, monthlyInterestRate = interestRate / 100 / 12);
    		}

    		if ($$self.$$.dirty & /*amount, monthlyInterestRate, totalPayments*/ 521) {
    			$$invalidate(4, monthlyPayment = amount * Math.pow(1 + monthlyInterestRate, totalPayments) * monthlyInterestRate / (Math.pow(1 + monthlyInterestRate, totalPayments) - 1));
    		}

    		if ($$self.$$.dirty & /*monthlyPayment, totalPayments*/ 24) {
    			$$invalidate(8, totalPaid = monthlyPayment * totalPayments);
    		}

    		if ($$self.$$.dirty & /*totalPaid, amount*/ 257) {
    			$$invalidate(6, interestPaid = totalPaid - amount);
    		}
    	};

    	return [
    		amount,
    		years,
    		interest,
    		totalPayments,
    		monthlyPayment,
    		interestRate,
    		interestPaid,
    		USDollar,
    		totalPaid,
    		monthlyInterestRate,
    		input0_input_handler,
    		input1_change_input_handler,
    		input2_change_input_handler
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
