var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
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
    function validate_store(store, name) {
        if (!store || typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, callback) {
        const unsub = store.subscribe(callback);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        return definition[2] && fn
            ? $$scope.dirty | definition[2](fn(dirty))
            : $$scope.dirty;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
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
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function xlink_attr(node, attribute, value) {
        node.setAttributeNS('http://www.w3.org/1999/xlink', attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
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
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            $$.fragment && $$.fragment.p($$.ctx, $$.dirty);
            $$.dirty = [-1];
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined' ? window : global);

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
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
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
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
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
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
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
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
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function cubicInOut(t) {
        return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
    }

    function is_date(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    function get_interpolator(a, b) {
        if (a === b || a !== a)
            return () => a;
        const type = typeof a;
        if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
            throw new Error('Cannot interpolate values of different type');
        }
        if (Array.isArray(a)) {
            const arr = b.map((bi, i) => {
                return get_interpolator(a[i], bi);
            });
            return t => arr.map(fn => fn(t));
        }
        if (type === 'object') {
            if (!a || !b)
                throw new Error('Object cannot be null');
            if (is_date(a) && is_date(b)) {
                a = a.getTime();
                b = b.getTime();
                const delta = b - a;
                return t => new Date(a + t * delta);
            }
            const keys = Object.keys(b);
            const interpolators = {};
            keys.forEach(key => {
                interpolators[key] = get_interpolator(a[key], b[key]);
            });
            return t => {
                const result = {};
                keys.forEach(key => {
                    result[key] = interpolators[key](t);
                });
                return result;
            };
        }
        if (type === 'number') {
            const delta = b - a;
            return t => a + t * delta;
        }
        throw new Error(`Cannot interpolate ${type} values`);
    }
    function tweened(value, defaults = {}) {
        const store = writable(value);
        let task;
        let target_value = value;
        function set(new_value, opts) {
            if (value == null) {
                store.set(value = new_value);
                return Promise.resolve();
            }
            target_value = new_value;
            let previous_task = task;
            let started = false;
            let { delay = 0, duration = 400, easing = identity, interpolate = get_interpolator } = assign(assign({}, defaults), opts);
            const start = now() + delay;
            let fn;
            task = loop(now => {
                if (now < start)
                    return true;
                if (!started) {
                    fn = interpolate(value, new_value);
                    if (typeof duration === 'function')
                        duration = duration(value, new_value);
                    started = true;
                }
                if (previous_task) {
                    previous_task.abort();
                    previous_task = null;
                }
                const elapsed = now - start;
                if (elapsed > duration) {
                    store.set(value = new_value);
                    return false;
                }
                // @ts-ignore
                store.set(value = fn(easing(elapsed / duration)));
                return true;
            });
            return task.promise;
        }
        return {
            set,
            update: (fn, opts) => set(fn(target_value, value), opts),
            subscribe: store.subscribe
        };
    }

    function define(constructor, factory, prototype) {
      constructor.prototype = factory.prototype = prototype;
      prototype.constructor = constructor;
    }

    function extend(parent, definition) {
      var prototype = Object.create(parent.prototype);
      for (var key in definition) prototype[key] = definition[key];
      return prototype;
    }

    function Color() {}

    var darker = 0.7;
    var brighter = 1 / darker;

    var reI = "\\s*([+-]?\\d+)\\s*",
        reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*",
        reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
        reHex = /^#([0-9a-f]{3,8})$/,
        reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$"),
        reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$"),
        reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$"),
        reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$"),
        reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$"),
        reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");

    var named = {
      aliceblue: 0xf0f8ff,
      antiquewhite: 0xfaebd7,
      aqua: 0x00ffff,
      aquamarine: 0x7fffd4,
      azure: 0xf0ffff,
      beige: 0xf5f5dc,
      bisque: 0xffe4c4,
      black: 0x000000,
      blanchedalmond: 0xffebcd,
      blue: 0x0000ff,
      blueviolet: 0x8a2be2,
      brown: 0xa52a2a,
      burlywood: 0xdeb887,
      cadetblue: 0x5f9ea0,
      chartreuse: 0x7fff00,
      chocolate: 0xd2691e,
      coral: 0xff7f50,
      cornflowerblue: 0x6495ed,
      cornsilk: 0xfff8dc,
      crimson: 0xdc143c,
      cyan: 0x00ffff,
      darkblue: 0x00008b,
      darkcyan: 0x008b8b,
      darkgoldenrod: 0xb8860b,
      darkgray: 0xa9a9a9,
      darkgreen: 0x006400,
      darkgrey: 0xa9a9a9,
      darkkhaki: 0xbdb76b,
      darkmagenta: 0x8b008b,
      darkolivegreen: 0x556b2f,
      darkorange: 0xff8c00,
      darkorchid: 0x9932cc,
      darkred: 0x8b0000,
      darksalmon: 0xe9967a,
      darkseagreen: 0x8fbc8f,
      darkslateblue: 0x483d8b,
      darkslategray: 0x2f4f4f,
      darkslategrey: 0x2f4f4f,
      darkturquoise: 0x00ced1,
      darkviolet: 0x9400d3,
      deeppink: 0xff1493,
      deepskyblue: 0x00bfff,
      dimgray: 0x696969,
      dimgrey: 0x696969,
      dodgerblue: 0x1e90ff,
      firebrick: 0xb22222,
      floralwhite: 0xfffaf0,
      forestgreen: 0x228b22,
      fuchsia: 0xff00ff,
      gainsboro: 0xdcdcdc,
      ghostwhite: 0xf8f8ff,
      gold: 0xffd700,
      goldenrod: 0xdaa520,
      gray: 0x808080,
      green: 0x008000,
      greenyellow: 0xadff2f,
      grey: 0x808080,
      honeydew: 0xf0fff0,
      hotpink: 0xff69b4,
      indianred: 0xcd5c5c,
      indigo: 0x4b0082,
      ivory: 0xfffff0,
      khaki: 0xf0e68c,
      lavender: 0xe6e6fa,
      lavenderblush: 0xfff0f5,
      lawngreen: 0x7cfc00,
      lemonchiffon: 0xfffacd,
      lightblue: 0xadd8e6,
      lightcoral: 0xf08080,
      lightcyan: 0xe0ffff,
      lightgoldenrodyellow: 0xfafad2,
      lightgray: 0xd3d3d3,
      lightgreen: 0x90ee90,
      lightgrey: 0xd3d3d3,
      lightpink: 0xffb6c1,
      lightsalmon: 0xffa07a,
      lightseagreen: 0x20b2aa,
      lightskyblue: 0x87cefa,
      lightslategray: 0x778899,
      lightslategrey: 0x778899,
      lightsteelblue: 0xb0c4de,
      lightyellow: 0xffffe0,
      lime: 0x00ff00,
      limegreen: 0x32cd32,
      linen: 0xfaf0e6,
      magenta: 0xff00ff,
      maroon: 0x800000,
      mediumaquamarine: 0x66cdaa,
      mediumblue: 0x0000cd,
      mediumorchid: 0xba55d3,
      mediumpurple: 0x9370db,
      mediumseagreen: 0x3cb371,
      mediumslateblue: 0x7b68ee,
      mediumspringgreen: 0x00fa9a,
      mediumturquoise: 0x48d1cc,
      mediumvioletred: 0xc71585,
      midnightblue: 0x191970,
      mintcream: 0xf5fffa,
      mistyrose: 0xffe4e1,
      moccasin: 0xffe4b5,
      navajowhite: 0xffdead,
      navy: 0x000080,
      oldlace: 0xfdf5e6,
      olive: 0x808000,
      olivedrab: 0x6b8e23,
      orange: 0xffa500,
      orangered: 0xff4500,
      orchid: 0xda70d6,
      palegoldenrod: 0xeee8aa,
      palegreen: 0x98fb98,
      paleturquoise: 0xafeeee,
      palevioletred: 0xdb7093,
      papayawhip: 0xffefd5,
      peachpuff: 0xffdab9,
      peru: 0xcd853f,
      pink: 0xffc0cb,
      plum: 0xdda0dd,
      powderblue: 0xb0e0e6,
      purple: 0x800080,
      rebeccapurple: 0x663399,
      red: 0xff0000,
      rosybrown: 0xbc8f8f,
      royalblue: 0x4169e1,
      saddlebrown: 0x8b4513,
      salmon: 0xfa8072,
      sandybrown: 0xf4a460,
      seagreen: 0x2e8b57,
      seashell: 0xfff5ee,
      sienna: 0xa0522d,
      silver: 0xc0c0c0,
      skyblue: 0x87ceeb,
      slateblue: 0x6a5acd,
      slategray: 0x708090,
      slategrey: 0x708090,
      snow: 0xfffafa,
      springgreen: 0x00ff7f,
      steelblue: 0x4682b4,
      tan: 0xd2b48c,
      teal: 0x008080,
      thistle: 0xd8bfd8,
      tomato: 0xff6347,
      turquoise: 0x40e0d0,
      violet: 0xee82ee,
      wheat: 0xf5deb3,
      white: 0xffffff,
      whitesmoke: 0xf5f5f5,
      yellow: 0xffff00,
      yellowgreen: 0x9acd32
    };

    define(Color, color, {
      copy: function(channels) {
        return Object.assign(new this.constructor, this, channels);
      },
      displayable: function() {
        return this.rgb().displayable();
      },
      hex: color_formatHex, // Deprecated! Use color.formatHex.
      formatHex: color_formatHex,
      formatHsl: color_formatHsl,
      formatRgb: color_formatRgb,
      toString: color_formatRgb
    });

    function color_formatHex() {
      return this.rgb().formatHex();
    }

    function color_formatHsl() {
      return hslConvert(this).formatHsl();
    }

    function color_formatRgb() {
      return this.rgb().formatRgb();
    }

    function color(format) {
      var m, l;
      format = (format + "").trim().toLowerCase();
      return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
          : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
          : l === 8 ? new Rgb(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
          : l === 4 ? new Rgb((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
          : null) // invalid hex
          : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
          : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
          : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
          : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
          : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
          : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
          : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
          : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
          : null;
    }

    function rgbn(n) {
      return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
    }

    function rgba(r, g, b, a) {
      if (a <= 0) r = g = b = NaN;
      return new Rgb(r, g, b, a);
    }

    function rgbConvert(o) {
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Rgb;
      o = o.rgb();
      return new Rgb(o.r, o.g, o.b, o.opacity);
    }

    function rgb(r, g, b, opacity) {
      return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
    }

    function Rgb(r, g, b, opacity) {
      this.r = +r;
      this.g = +g;
      this.b = +b;
      this.opacity = +opacity;
    }

    define(Rgb, rgb, extend(Color, {
      brighter: function(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      darker: function(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      rgb: function() {
        return this;
      },
      displayable: function() {
        return (-0.5 <= this.r && this.r < 255.5)
            && (-0.5 <= this.g && this.g < 255.5)
            && (-0.5 <= this.b && this.b < 255.5)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      hex: rgb_formatHex, // Deprecated! Use color.formatHex.
      formatHex: rgb_formatHex,
      formatRgb: rgb_formatRgb,
      toString: rgb_formatRgb
    }));

    function rgb_formatHex() {
      return "#" + hex(this.r) + hex(this.g) + hex(this.b);
    }

    function rgb_formatRgb() {
      var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
      return (a === 1 ? "rgb(" : "rgba(")
          + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", "
          + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", "
          + Math.max(0, Math.min(255, Math.round(this.b) || 0))
          + (a === 1 ? ")" : ", " + a + ")");
    }

    function hex(value) {
      value = Math.max(0, Math.min(255, Math.round(value) || 0));
      return (value < 16 ? "0" : "") + value.toString(16);
    }

    function hsla(h, s, l, a) {
      if (a <= 0) h = s = l = NaN;
      else if (l <= 0 || l >= 1) h = s = NaN;
      else if (s <= 0) h = NaN;
      return new Hsl(h, s, l, a);
    }

    function hslConvert(o) {
      if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Hsl;
      if (o instanceof Hsl) return o;
      o = o.rgb();
      var r = o.r / 255,
          g = o.g / 255,
          b = o.b / 255,
          min = Math.min(r, g, b),
          max = Math.max(r, g, b),
          h = NaN,
          s = max - min,
          l = (max + min) / 2;
      if (s) {
        if (r === max) h = (g - b) / s + (g < b) * 6;
        else if (g === max) h = (b - r) / s + 2;
        else h = (r - g) / s + 4;
        s /= l < 0.5 ? max + min : 2 - max - min;
        h *= 60;
      } else {
        s = l > 0 && l < 1 ? 0 : h;
      }
      return new Hsl(h, s, l, o.opacity);
    }

    function hsl(h, s, l, opacity) {
      return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
    }

    function Hsl(h, s, l, opacity) {
      this.h = +h;
      this.s = +s;
      this.l = +l;
      this.opacity = +opacity;
    }

    define(Hsl, hsl, extend(Color, {
      brighter: function(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      darker: function(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      rgb: function() {
        var h = this.h % 360 + (this.h < 0) * 360,
            s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
            l = this.l,
            m2 = l + (l < 0.5 ? l : 1 - l) * s,
            m1 = 2 * l - m2;
        return new Rgb(
          hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
          hsl2rgb(h, m1, m2),
          hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
          this.opacity
        );
      },
      displayable: function() {
        return (0 <= this.s && this.s <= 1 || isNaN(this.s))
            && (0 <= this.l && this.l <= 1)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      formatHsl: function() {
        var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
        return (a === 1 ? "hsl(" : "hsla(")
            + (this.h || 0) + ", "
            + (this.s || 0) * 100 + "%, "
            + (this.l || 0) * 100 + "%"
            + (a === 1 ? ")" : ", " + a + ")");
      }
    }));

    /* From FvD 13.37, CSS Color Module Level 3 */
    function hsl2rgb(h, m1, m2) {
      return (h < 60 ? m1 + (m2 - m1) * h / 60
          : h < 180 ? m2
          : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
          : m1) * 255;
    }

    var deg2rad = Math.PI / 180;
    var rad2deg = 180 / Math.PI;

    // https://observablehq.com/@mbostock/lab-and-rgb
    var K = 18,
        Xn = 0.96422,
        Yn = 1,
        Zn = 0.82521,
        t0 = 4 / 29,
        t1 = 6 / 29,
        t2 = 3 * t1 * t1,
        t3 = t1 * t1 * t1;

    function labConvert(o) {
      if (o instanceof Lab) return new Lab(o.l, o.a, o.b, o.opacity);
      if (o instanceof Hcl) return hcl2lab(o);
      if (!(o instanceof Rgb)) o = rgbConvert(o);
      var r = rgb2lrgb(o.r),
          g = rgb2lrgb(o.g),
          b = rgb2lrgb(o.b),
          y = xyz2lab((0.2225045 * r + 0.7168786 * g + 0.0606169 * b) / Yn), x, z;
      if (r === g && g === b) x = z = y; else {
        x = xyz2lab((0.4360747 * r + 0.3850649 * g + 0.1430804 * b) / Xn);
        z = xyz2lab((0.0139322 * r + 0.0971045 * g + 0.7141733 * b) / Zn);
      }
      return new Lab(116 * y - 16, 500 * (x - y), 200 * (y - z), o.opacity);
    }

    function lab(l, a, b, opacity) {
      return arguments.length === 1 ? labConvert(l) : new Lab(l, a, b, opacity == null ? 1 : opacity);
    }

    function Lab(l, a, b, opacity) {
      this.l = +l;
      this.a = +a;
      this.b = +b;
      this.opacity = +opacity;
    }

    define(Lab, lab, extend(Color, {
      brighter: function(k) {
        return new Lab(this.l + K * (k == null ? 1 : k), this.a, this.b, this.opacity);
      },
      darker: function(k) {
        return new Lab(this.l - K * (k == null ? 1 : k), this.a, this.b, this.opacity);
      },
      rgb: function() {
        var y = (this.l + 16) / 116,
            x = isNaN(this.a) ? y : y + this.a / 500,
            z = isNaN(this.b) ? y : y - this.b / 200;
        x = Xn * lab2xyz(x);
        y = Yn * lab2xyz(y);
        z = Zn * lab2xyz(z);
        return new Rgb(
          lrgb2rgb( 3.1338561 * x - 1.6168667 * y - 0.4906146 * z),
          lrgb2rgb(-0.9787684 * x + 1.9161415 * y + 0.0334540 * z),
          lrgb2rgb( 0.0719453 * x - 0.2289914 * y + 1.4052427 * z),
          this.opacity
        );
      }
    }));

    function xyz2lab(t) {
      return t > t3 ? Math.pow(t, 1 / 3) : t / t2 + t0;
    }

    function lab2xyz(t) {
      return t > t1 ? t * t * t : t2 * (t - t0);
    }

    function lrgb2rgb(x) {
      return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    }

    function rgb2lrgb(x) {
      return (x /= 255) <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }

    function hclConvert(o) {
      if (o instanceof Hcl) return new Hcl(o.h, o.c, o.l, o.opacity);
      if (!(o instanceof Lab)) o = labConvert(o);
      if (o.a === 0 && o.b === 0) return new Hcl(NaN, 0 < o.l && o.l < 100 ? 0 : NaN, o.l, o.opacity);
      var h = Math.atan2(o.b, o.a) * rad2deg;
      return new Hcl(h < 0 ? h + 360 : h, Math.sqrt(o.a * o.a + o.b * o.b), o.l, o.opacity);
    }

    function hcl(h, c, l, opacity) {
      return arguments.length === 1 ? hclConvert(h) : new Hcl(h, c, l, opacity == null ? 1 : opacity);
    }

    function Hcl(h, c, l, opacity) {
      this.h = +h;
      this.c = +c;
      this.l = +l;
      this.opacity = +opacity;
    }

    function hcl2lab(o) {
      if (isNaN(o.h)) return new Lab(o.l, 0, 0, o.opacity);
      var h = o.h * deg2rad;
      return new Lab(o.l, Math.cos(h) * o.c, Math.sin(h) * o.c, o.opacity);
    }

    define(Hcl, hcl, extend(Color, {
      brighter: function(k) {
        return new Hcl(this.h, this.c, this.l + K * (k == null ? 1 : k), this.opacity);
      },
      darker: function(k) {
        return new Hcl(this.h, this.c, this.l - K * (k == null ? 1 : k), this.opacity);
      },
      rgb: function() {
        return hcl2lab(this).rgb();
      }
    }));

    function constant(x) {
      return function() {
        return x;
      };
    }

    function linear(a, d) {
      return function(t) {
        return a + t * d;
      };
    }

    function exponential(a, b, y) {
      return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
        return Math.pow(a + t * b, y);
      };
    }

    function hue(a, b) {
      var d = b - a;
      return d ? linear(a, d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d) : constant(isNaN(a) ? b : a);
    }

    function gamma(y) {
      return (y = +y) === 1 ? nogamma : function(a, b) {
        return b - a ? exponential(a, b, y) : constant(isNaN(a) ? b : a);
      };
    }

    function nogamma(a, b) {
      var d = b - a;
      return d ? linear(a, d) : constant(isNaN(a) ? b : a);
    }

    var rgb$1 = (function rgbGamma(y) {
      var color = gamma(y);

      function rgb$1(start, end) {
        var r = color((start = rgb(start)).r, (end = rgb(end)).r),
            g = color(start.g, end.g),
            b = color(start.b, end.b),
            opacity = nogamma(start.opacity, end.opacity);
        return function(t) {
          start.r = r(t);
          start.g = g(t);
          start.b = b(t);
          start.opacity = opacity(t);
          return start + "";
        };
      }

      rgb$1.gamma = rgbGamma;

      return rgb$1;
    })(1);

    function numberArray(a, b) {
      if (!b) b = [];
      var n = a ? Math.min(b.length, a.length) : 0,
          c = b.slice(),
          i;
      return function(t) {
        for (i = 0; i < n; ++i) c[i] = a[i] * (1 - t) + b[i] * t;
        return c;
      };
    }

    function isNumberArray(x) {
      return ArrayBuffer.isView(x) && !(x instanceof DataView);
    }

    function genericArray(a, b) {
      var nb = b ? b.length : 0,
          na = a ? Math.min(nb, a.length) : 0,
          x = new Array(na),
          c = new Array(nb),
          i;

      for (i = 0; i < na; ++i) x[i] = interpolate(a[i], b[i]);
      for (; i < nb; ++i) c[i] = b[i];

      return function(t) {
        for (i = 0; i < na; ++i) c[i] = x[i](t);
        return c;
      };
    }

    function date(a, b) {
      var d = new Date;
      return a = +a, b = +b, function(t) {
        return d.setTime(a * (1 - t) + b * t), d;
      };
    }

    function interpolateNumber(a, b) {
      return a = +a, b = +b, function(t) {
        return a * (1 - t) + b * t;
      };
    }

    function object(a, b) {
      var i = {},
          c = {},
          k;

      if (a === null || typeof a !== "object") a = {};
      if (b === null || typeof b !== "object") b = {};

      for (k in b) {
        if (k in a) {
          i[k] = interpolate(a[k], b[k]);
        } else {
          c[k] = b[k];
        }
      }

      return function(t) {
        for (k in i) c[k] = i[k](t);
        return c;
      };
    }

    var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
        reB = new RegExp(reA.source, "g");

    function zero(b) {
      return function() {
        return b;
      };
    }

    function one(b) {
      return function(t) {
        return b(t) + "";
      };
    }

    function interpolateString(a, b) {
      var bi = reA.lastIndex = reB.lastIndex = 0, // scan index for next number in b
          am, // current match in a
          bm, // current match in b
          bs, // string preceding current number in b, if any
          i = -1, // index in s
          s = [], // string constants and placeholders
          q = []; // number interpolators

      // Coerce inputs to strings.
      a = a + "", b = b + "";

      // Interpolate pairs of numbers in a & b.
      while ((am = reA.exec(a))
          && (bm = reB.exec(b))) {
        if ((bs = bm.index) > bi) { // a string precedes the next number in b
          bs = b.slice(bi, bs);
          if (s[i]) s[i] += bs; // coalesce with previous string
          else s[++i] = bs;
        }
        if ((am = am[0]) === (bm = bm[0])) { // numbers in a & b match
          if (s[i]) s[i] += bm; // coalesce with previous string
          else s[++i] = bm;
        } else { // interpolate non-matching numbers
          s[++i] = null;
          q.push({i: i, x: interpolateNumber(am, bm)});
        }
        bi = reB.lastIndex;
      }

      // Add remains of b.
      if (bi < b.length) {
        bs = b.slice(bi);
        if (s[i]) s[i] += bs; // coalesce with previous string
        else s[++i] = bs;
      }

      // Special optimization for only a single match.
      // Otherwise, interpolate each of the numbers and rejoin the string.
      return s.length < 2 ? (q[0]
          ? one(q[0].x)
          : zero(b))
          : (b = q.length, function(t) {
              for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);
              return s.join("");
            });
    }

    function interpolate(a, b) {
      var t = typeof b, c;
      return b == null || t === "boolean" ? constant(b)
          : (t === "number" ? interpolateNumber
          : t === "string" ? ((c = color(b)) ? (b = c, rgb$1) : interpolateString)
          : b instanceof color ? rgb$1
          : b instanceof Date ? date
          : isNumberArray(b) ? numberArray
          : Array.isArray(b) ? genericArray
          : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object
          : interpolateNumber)(a, b);
    }

    function interpolateRound(a, b) {
      return a = +a, b = +b, function(t) {
        return Math.round(a * (1 - t) + b * t);
      };
    }

    function hcl$1(hue) {
      return function(start, end) {
        var h = hue((start = hcl(start)).h, (end = hcl(end)).h),
            c = nogamma(start.c, end.c),
            l = nogamma(start.l, end.l),
            opacity = nogamma(start.opacity, end.opacity);
        return function(t) {
          start.h = h(t);
          start.c = c(t);
          start.l = l(t);
          start.opacity = opacity(t);
          return start + "";
        };
      }
    }

    var interpolateHcl = hcl$1(hue);

    function quantize(interpolator, n) {
      var samples = new Array(n);
      for (var i = 0; i < n; ++i) samples[i] = interpolator(i / (n - 1));
      return samples;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }

    /* src\Line.svelte generated by Svelte v3.16.0 */
    const file = "src\\Line.svelte";

    function create_fragment(ctx) {
    	let g;
    	let path0;
    	let path1;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			attr_dev(path0, "class", "lines");
    			attr_dev(path0, "fill", "none");
    			attr_dev(path0, "stroke", /*color*/ ctx[0]);
    			attr_dev(path0, "stroke-width", /*strokeWidth*/ ctx[2]);
    			attr_dev(path0, "stroke-dasharray", /*dashArray*/ ctx[1]);
    			attr_dev(path0, "d", /*$lineStore*/ ctx[3]);
    			add_location(path0, file, 27, 2, 658);
    			attr_dev(path1, "class", "areas");
    			attr_dev(path1, "fill", /*color*/ ctx[0]);
    			attr_dev(path1, "opacity", "0.7");
    			attr_dev(path1, "d", /*$areaStore*/ ctx[4]);
    			add_location(path1, file, 35, 2, 814);
    			add_location(g, file, 26, 0, 651);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, path0);
    			append_dev(g, path1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*color*/ 1) {
    				attr_dev(path0, "stroke", /*color*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 4) {
    				attr_dev(path0, "stroke-width", /*strokeWidth*/ ctx[2]);
    			}

    			if (dirty & /*dashArray*/ 2) {
    				attr_dev(path0, "stroke-dasharray", /*dashArray*/ ctx[1]);
    			}

    			if (dirty & /*$lineStore*/ 8) {
    				attr_dev(path0, "d", /*$lineStore*/ ctx[3]);
    			}

    			if (dirty & /*color*/ 1) {
    				attr_dev(path1, "fill", /*color*/ ctx[0]);
    			}

    			if (dirty & /*$areaStore*/ 16) {
    				attr_dev(path1, "d", /*$areaStore*/ ctx[4]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $lineStore;
    	let $areaStore;
    	let { color } = $$props;
    	let { linePath } = $$props;
    	let { areaPath } = $$props;
    	let { duration } = $$props;
    	let { dashArray = "" } = $$props;
    	let { strokeWidth = 2 } = $$props;

    	const options = {
    		duration,
    		easing: cubicInOut,
    		interpolate: interpolateString
    	};

    	const lineStore = tweened(undefined, options);
    	validate_store(lineStore, "lineStore");
    	component_subscribe($$self, lineStore, value => $$invalidate(3, $lineStore = value));
    	const areaStore = tweened(undefined, options);
    	validate_store(areaStore, "areaStore");
    	component_subscribe($$self, areaStore, value => $$invalidate(4, $areaStore = value));
    	const writable_props = ["color", "linePath", "areaPath", "duration", "dashArray", "strokeWidth"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Line> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("linePath" in $$props) $$invalidate(5, linePath = $$props.linePath);
    		if ("areaPath" in $$props) $$invalidate(6, areaPath = $$props.areaPath);
    		if ("duration" in $$props) $$invalidate(7, duration = $$props.duration);
    		if ("dashArray" in $$props) $$invalidate(1, dashArray = $$props.dashArray);
    		if ("strokeWidth" in $$props) $$invalidate(2, strokeWidth = $$props.strokeWidth);
    	};

    	$$self.$capture_state = () => {
    		return {
    			color,
    			linePath,
    			areaPath,
    			duration,
    			dashArray,
    			strokeWidth,
    			$lineStore,
    			$areaStore
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("linePath" in $$props) $$invalidate(5, linePath = $$props.linePath);
    		if ("areaPath" in $$props) $$invalidate(6, areaPath = $$props.areaPath);
    		if ("duration" in $$props) $$invalidate(7, duration = $$props.duration);
    		if ("dashArray" in $$props) $$invalidate(1, dashArray = $$props.dashArray);
    		if ("strokeWidth" in $$props) $$invalidate(2, strokeWidth = $$props.strokeWidth);
    		if ("$lineStore" in $$props) lineStore.set($lineStore = $$props.$lineStore);
    		if ("$areaStore" in $$props) areaStore.set($areaStore = $$props.$areaStore);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*linePath*/ 32) {
    			 lineStore.set(linePath);
    		}

    		if ($$self.$$.dirty & /*areaPath*/ 64) {
    			 areaStore.set(areaPath);
    		}
    	};

    	return [
    		color,
    		dashArray,
    		strokeWidth,
    		$lineStore,
    		$areaStore,
    		linePath,
    		areaPath,
    		duration
    	];
    }

    class Line extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			color: 0,
    			linePath: 5,
    			areaPath: 6,
    			duration: 7,
    			dashArray: 1,
    			strokeWidth: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Line",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*color*/ ctx[0] === undefined && !("color" in props)) {
    			console.warn("<Line> was created without expected prop 'color'");
    		}

    		if (/*linePath*/ ctx[5] === undefined && !("linePath" in props)) {
    			console.warn("<Line> was created without expected prop 'linePath'");
    		}

    		if (/*areaPath*/ ctx[6] === undefined && !("areaPath" in props)) {
    			console.warn("<Line> was created without expected prop 'areaPath'");
    		}

    		if (/*duration*/ ctx[7] === undefined && !("duration" in props)) {
    			console.warn("<Line> was created without expected prop 'duration'");
    		}
    	}

    	get color() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get linePath() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set linePath(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get areaPath() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set areaPath(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get duration() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dashArray() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dashArray(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function bisector(compare) {
      if (compare.length === 1) compare = ascendingComparator(compare);
      return {
        left: function(a, x, lo, hi) {
          if (lo == null) lo = 0;
          if (hi == null) hi = a.length;
          while (lo < hi) {
            var mid = lo + hi >>> 1;
            if (compare(a[mid], x) < 0) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        },
        right: function(a, x, lo, hi) {
          if (lo == null) lo = 0;
          if (hi == null) hi = a.length;
          while (lo < hi) {
            var mid = lo + hi >>> 1;
            if (compare(a[mid], x) > 0) hi = mid;
            else lo = mid + 1;
          }
          return lo;
        }
      };
    }

    function ascendingComparator(f) {
      return function(d, x) {
        return ascending(f(d), x);
      };
    }

    var ascendingBisect = bisector(ascending);
    var bisectRight = ascendingBisect.right;

    function descending(a, b) {
      return b < a ? -1 : b > a ? 1 : b >= a ? 0 : NaN;
    }

    function extent(values, valueof) {
      let min;
      let max;
      if (valueof === undefined) {
        for (const value of values) {
          if (value != null) {
            if (min === undefined) {
              if (value >= value) min = max = value;
            } else {
              if (min > value) min = value;
              if (max < value) max = value;
            }
          }
        }
      } else {
        let index = -1;
        for (let value of values) {
          if ((value = valueof(value, ++index, values)) != null) {
            if (min === undefined) {
              if (value >= value) min = max = value;
            } else {
              if (min > value) min = value;
              if (max < value) max = value;
            }
          }
        }
      }
      return [min, max];
    }

    function identity$1(x) {
      return x;
    }

    function group(values, ...keys) {
      return nest(values, identity$1, identity$1, keys);
    }

    function groups(values, ...keys) {
      return nest(values, Array.from, identity$1, keys);
    }

    function rollup(values, reduce, ...keys) {
      return nest(values, identity$1, reduce, keys);
    }

    function nest(values, map, reduce, keys) {
      return (function regroup(values, i) {
        if (i >= keys.length) return reduce(values);
        const groups = new Map();
        const keyof = keys[i++];
        let index = -1;
        for (const value of values) {
          const key = keyof(value, ++index, values);
          const group = groups.get(key);
          if (group) group.push(value);
          else groups.set(key, [value]);
        }
        for (const [key, values] of groups) {
          groups.set(key, regroup(values, i));
        }
        return map(groups);
      })(values, 0);
    }

    function range(start, stop, step) {
      start = +start, stop = +stop, step = (n = arguments.length) < 2 ? (stop = start, start = 0, 1) : n < 3 ? 1 : +step;

      var i = -1,
          n = Math.max(0, Math.ceil((stop - start) / step)) | 0,
          range = new Array(n);

      while (++i < n) {
        range[i] = start + i * step;
      }

      return range;
    }

    var e10 = Math.sqrt(50),
        e5 = Math.sqrt(10),
        e2 = Math.sqrt(2);

    function ticks(start, stop, count) {
      var reverse,
          i = -1,
          n,
          ticks,
          step;

      stop = +stop, start = +start, count = +count;
      if (start === stop && count > 0) return [start];
      if (reverse = stop < start) n = start, start = stop, stop = n;
      if ((step = tickIncrement(start, stop, count)) === 0 || !isFinite(step)) return [];

      if (step > 0) {
        start = Math.ceil(start / step);
        stop = Math.floor(stop / step);
        ticks = new Array(n = Math.ceil(stop - start + 1));
        while (++i < n) ticks[i] = (start + i) * step;
      } else {
        start = Math.floor(start * step);
        stop = Math.ceil(stop * step);
        ticks = new Array(n = Math.ceil(start - stop + 1));
        while (++i < n) ticks[i] = (start - i) / step;
      }

      if (reverse) ticks.reverse();

      return ticks;
    }

    function tickIncrement(start, stop, count) {
      var step = (stop - start) / Math.max(0, count),
          power = Math.floor(Math.log(step) / Math.LN10),
          error = step / Math.pow(10, power);
      return power >= 0
          ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power)
          : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
    }

    function tickStep(start, stop, count) {
      var step0 = Math.abs(stop - start) / Math.max(0, count),
          step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)),
          error = step0 / step1;
      if (error >= e10) step1 *= 10;
      else if (error >= e5) step1 *= 5;
      else if (error >= e2) step1 *= 2;
      return stop < start ? -step1 : step1;
    }

    function max(values, valueof) {
      let max;
      if (valueof === undefined) {
        for (const value of values) {
          if (value != null
              && (max < value || (max === undefined && value >= value))) {
            max = value;
          }
        }
      } else {
        let index = -1;
        for (let value of values) {
          if ((value = valueof(value, ++index, values)) != null
              && (max < value || (max === undefined && value >= value))) {
            max = value;
          }
        }
      }
      return max;
    }

    function mean(values, valueof) {
      let count = 0;
      let sum = 0;
      if (valueof === undefined) {
        for (let value of values) {
          if (value != null && (value = +value) >= value) {
            ++count, sum += value;
          }
        }
      } else {
        let index = -1;
        for (let value of values) {
          if ((value = valueof(value, ++index, values)) != null && (value = +value) >= value) {
            ++count, sum += value;
          }
        }
      }
      if (count) return sum / count;
    }

    function permute(source, keys) {
      return Array.from(keys, key => source[key]);
    }

    var options = new Map([
        {
            "options": [
                {
                    "label": "Any Setting",
                    "value": 0
                },
                {
                    "label": "All Settings (Each One Separately)",
                    "value": -9
                },
                {
                    "label": "Ambulatory Care",
                    "value": 2
                },
                {
                    "label": "Correctional Facility",
                    "value": 8
                },
                {
                    "label": "Home Health/Hospice",
                    "value": 4
                },
                {
                    "label": "Hospital",
                    "value": 1
                },
                {
                    "label": "Mental Health Hospital/Facility",
                    "value": 7
                },
                {
                    "label": "Nursing Education",
                    "value": 6
                },
                {
                    "label": "Nursing Home/Extended Care/Assistive Living",
                    "value": 3
                },
                {
                    "label": "Community and Population Health",
                    "value": 5
                }
            ],
            "label": "Setting",
            "name": "setting"
        },
        {
            "options": [
                { "value": 0, "label": "State" },
                { "value": 8, "label": "Medicaid Region" },
                { "value": 5, "label": "AHEC" },
                { "value": 7, "label": "Metro/Nonmetro" },
            ], "label": "Location Type", "name": "locationType"
        },
        {
            "options": [
                { "value": "supply", "label": "Supply" },
                { "value": "demand", "label": "Demand" },
                { "value": "percentage", "label": "Supply / Demand" },
                { "value": "difference", "label": "Supply - Demand" },
            ], "label": "Calculation", "name": "calculation"
        },
        {
            "options": [
                {
                    "value": 0,
                    "label": "All NC"
                },
                {
                    "value": 800,
                    "label": "Western NC (1)"
                },
                {
                    "value": 801,
                    "label": "Northwest / Triad (2)"
                },
                {
                    "value": 802,
                    "label": "Southcentral / Charlotte (3)"
                },
                {
                    "value": 803,
                    "label": "Piedmont / Triangle (4)"
                },
                {
                    "value": 804,
                    "label": "Southeast / Wilmington (5)"
                },
                {
                    "value": 805,
                    "label": "Eastern NC (6)"
                },
                {
                    "value": 500,
                    "label": "Area L"
                },
                {
                    "value": 501,
                    "label": "Charlotte AHEC"
                },
                {
                    "value": 503,
                    "label": "Eastern"
                },
                {
                    "value": 504,
                    "label": "Greensboro"
                },
                {
                    "value": 505,
                    "label": "Mountain"
                },
                {
                    "value": 506,
                    "label": "Northwest"
                },
                {
                    "value": 502,
                    "label": "South East"
                },
                {
                    "value": 507,
                    "label": "Southern Regional"
                },
                {
                    "value": 508,
                    "label": "Wake AHEC"
                },
                {
                    "value": 700,
                    "label": "Metropolitan"
                },
                {
                    "value": 701,
                    "label": "Nonmetropolitan"
                }
            ],
            "label": "Location",
            "name": "location"
        },
        {
            "options": [
                {
                    "value": 52,
                    "label": "Baseline Supply"
                },
                {
                    "value": 56,
                    "label": "Early Leavers (2 years early so everyone retires by 68)"
                },
                {
                    "value": 57,
                    "label": "Early Leavers (5 years early so everyone retires by 65)"
                },
                {
                    "value": 58,
                    "label": "Delayed Leavers (delayed by 2 years but everyone retires by 70)"
                },
                {
                    "value": 59,
                    "label": "Reduction in Out-of-State Supply by 2.5%"
                },
                {
                    "value": 62,
                    "label": "10% Increase in Graduate Supply"
                },
            ],
            "label": "Supply Scenario",
            "name": "supplyScenario"
        },
        {
            "options": [
                {
                    "value": 1,
                    "label": "Baseline Demand"
                }
            ],
            "label": "Demand Scenario",
            "name": "demandScenario"
        },
        {
            "options": [
                {
                    "value": 0,
                    "label": "LPN & RN"
                },
                {
                    "value": 1,
                    "label": "LPN"
                },
                {
                    "value": 2,
                    "label": "RN"
                },
            ],
            "name": "type",
            "label": "Nurse Type"
        }, {
            "options": [
                {
                    "value": 0,
                    "label": "All Education"
                },
                {
                    "value": 4,
                    "label": "BS & MS"
                },
                {
                    "value": 5,
                    "label": "ADN & Diploma"
                },
            ],
            "name": "education",
            "label": "Education"
        }, {
            "options": [
                {
                    "value": 0,
                    "label": "Rate per 10K population"
                },
                {
                    "value": 1,
                    "label": "Total"
                }
            ],
            "name": "rateOrTotal",
            "label": "Rate Or Total"
        },
        {
            "options": [
                {
                    "value": 0,
                    "label": "Headcount"
                },
                {
                    "value": 1,
                    "label": "FTE"
                }
            ],
            "name": "fteOrHeadcount",
            "label": "FTE or Headcount"
        }
    ].map(d => [d.name, Object.assign({ optionsMap: new Map(d.options.map(e => [e.value, e.label])) }, d)]));

    function fontColor(bgColor) {
        //https://stackoverflow.com/questions/3942878/how-to-decide-font-color-in-white-or-black-depending-on-background-color
        const rgb = color(bgColor).rgb();
        return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114 > 186
            ? "#000000"
            : "#ffffff";
    }


    function numberFormat(total = 1) {
        return v =>
            total
                ? Math.round(v).toLocaleString()
                : v.toLocaleString(undefined, {
                    minimumSignificantDigits: 3,
                    maximumSignificantDigits: 3
                });
    }

    function makeQueryURL(params, baseURL = "http://localhost:8080/data/") {
        return `${baseURL}?${params
        .map(d => `${d.name}=${d.value}`)
        .join("&")}`;
    }


    async function dataFetch(queryURL) {
        const data = await fetch(queryURL)
            .then(response => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.json();
            })
            .then(json => {
                if (json.length == 0) {
                    throw new Error("No data.");
                } else {
                    return json;
                }
            })
            .catch(error => {
                console.error(
                    "There has been a problem with your fetch operation:",
                    error
                );
            });
        return data;
    }

    // Underscore.js 1.9.2
    // https://underscorejs.org
    // (c) 2009-2018 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
    // Underscore may be freely distributed under the MIT license.
    const restArguments = function (func, startIndex) {
        startIndex = startIndex == null ? func.length - 1 : +startIndex;
        return function () {
            var length = Math.max(arguments.length - startIndex, 0),
                rest = Array(length),
                index = 0;
            for (; index < length; index++) {
                rest[index] = arguments[index + startIndex];
            }
            switch (startIndex) {
                case 0: return func.call(this, rest);
                case 1: return func.call(this, arguments[0], rest);
                case 2: return func.call(this, arguments[0], arguments[1], rest);
            }
            var args = Array(startIndex + 1);
            for (index = 0; index < startIndex; index++) {
                args[index] = arguments[index];
            }
            args[startIndex] = rest;
            return func.apply(this, args);
        };
    };

    const delay = restArguments(function (func, wait, args) {
        return setTimeout(function () {
            return func.apply(null, args);
        }, wait);
    });

    function throttle(func, wait, options) {
        var timeout, context, args, result;
        var previous = 0;
        if (!options) options = {};

        var later = function () {
            previous = options.leading === false ? 0 : Date.now();
            timeout = null;
            result = func.apply(context, args);
            if (!timeout) context = args = null;
        };

        var throttled = function () {
            var now = Date.now();
            if (!previous && options.leading === false) previous = now;
            var remaining = wait - (now - previous);
            context = this;
            args = arguments;
            if (remaining <= 0 || remaining > wait) {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                previous = now;
                result = func.apply(context, args);
                if (!timeout) context = args = null;
            } else if (!timeout && options.trailing !== false) {
                timeout = setTimeout(later, remaining);
            }
            return result;
        };

        throttled.cancel = function () {
            clearTimeout(timeout);
            previous = 0;
            timeout = context = args = null;
        };

        return throttled;
    }
    // A function to break text into tspans. Adapted from [this Stack Overflow answer](https://stackoverflow.com/questions/475804/svg-word-wrap-show-stopper)
    //   and [Wrapping Long Labels](https://bl.ocks.org/mbostock/7555321) 
    //   and the function format of [Inputs](https://beta.observablehq.com/@jashkenas/inputs).`

    function createSVGtext(config = {}) {

        let { text, x = 0, y = 0,
            fontSize = 14, fill = '#333',
            textAnchor = "left",
            maxCharsPerLine = 65,
            lineHeight = 1.3 } = config;

        if (typeof config == "string") text = config;

        let svgText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        svgText.setAttributeNS(null, 'x', x);
        svgText.setAttributeNS(null, 'y', y);
        svgText.setAttributeNS(null, 'font-size', fontSize);
        svgText.setAttributeNS(null, 'fill', fill);
        svgText.setAttributeNS(null, 'text-anchor', textAnchor);

        let words = text.trim().split(/\s+/).reverse(),
            word,
            dy = 0,
            line = [];

        while (word = words.pop()) {

            line.push(word);
            let testLineLength = line.join(" ").length;

            if (testLineLength > maxCharsPerLine) {
                line.pop();

                let svgTSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                svgTSpan.setAttributeNS(null, 'x', x);
                svgTSpan.setAttributeNS(null, 'dy', dy + "em");

                let tSpanTextNode = document.createTextNode(line.join(" "));
                svgTSpan.appendChild(tSpanTextNode);
                svgText.appendChild(svgTSpan);

                line = [word];
                dy = lineHeight;
            }
        }

        let svgTSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        svgTSpan.setAttributeNS(null, 'x', x);
        svgTSpan.setAttributeNS(null, 'dy', dy + "em");

        let tSpanTextNode = document.createTextNode(line.join(" "));
        svgTSpan.appendChild(tSpanTextNode);
        svgText.appendChild(svgTSpan);

        return svgText;
    }

    /* src\LineChartLegendTable.svelte generated by Svelte v3.16.0 */

    const { Object: Object_1 } = globals;
    const file$1 = "src\\LineChartLegendTable.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	return child_ctx;
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	return child_ctx;
    }

    // (49:8) {#each columnOrder as column}
    function create_each_block_2(ctx) {
    	let th;
    	let t_value = options.get(/*column*/ ctx[9]).label + "";
    	let t;

    	const block = {
    		c: function create() {
    			th = element("th");
    			t = text(t_value);
    			add_location(th, file$1, 49, 10, 1403);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, th, anchor);
    			append_dev(th, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*columnOrder*/ 1 && t_value !== (t_value = options.get(/*column*/ ctx[9]).label + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(th);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(49:8) {#each columnOrder as column}",
    		ctx
    	});

    	return block;
    }

    // (65:10) {#each columnOrder as column}
    function create_each_block_1(ctx) {
    	let td;
    	let t_value = options.get(/*column*/ ctx[9]).optionsMap.get(/*row*/ ctx[6].paramsMap.get(/*column*/ ctx[9])) + "";
    	let t;

    	const block = {
    		c: function create() {
    			td = element("td");
    			t = text(t_value);
    			toggle_class(td, "has-text-weight-bold", /*parametersDifferent*/ ctx[2].get(/*column*/ ctx[9]));
    			toggle_class(td, "has-text-black-bis", /*parametersDifferent*/ ctx[2].get(/*column*/ ctx[9]));
    			add_location(td, file$1, 65, 12, 1871);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*columnOrder, rows*/ 3 && t_value !== (t_value = options.get(/*column*/ ctx[9]).optionsMap.get(/*row*/ ctx[6].paramsMap.get(/*column*/ ctx[9])) + "")) set_data_dev(t, t_value);

    			if (dirty & /*parametersDifferent, columnOrder*/ 5) {
    				toggle_class(td, "has-text-weight-bold", /*parametersDifferent*/ ctx[2].get(/*column*/ ctx[9]));
    			}

    			if (dirty & /*parametersDifferent, columnOrder*/ 5) {
    				toggle_class(td, "has-text-black-bis", /*parametersDifferent*/ ctx[2].get(/*column*/ ctx[9]));
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(65:10) {#each columnOrder as column}",
    		ctx
    	});

    	return block;
    }

    // (55:6) {#each rows as row}
    function create_each_block(ctx) {
    	let tr;
    	let td;
    	let button;
    	let button_data_id_value;
    	let t0;
    	let t1;
    	let dispose;
    	let each_value_1 = /*columnOrder*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td = element("td");
    			button = element("button");
    			t0 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			attr_dev(button, "class", "delete");
    			attr_dev(button, "data-id", button_data_id_value = /*row*/ ctx[6].id);
    			attr_dev(button, "aria-label", "delete");
    			add_location(button, file$1, 57, 12, 1630);
    			set_style(td, "background-color", /*row*/ ctx[6].color);
    			set_style(td, "vertical-align", "middle");
    			add_location(td, file$1, 56, 10, 1549);
    			add_location(tr, file$1, 55, 8, 1533);
    			dispose = listen_dev(button, "click", /*handleDeleteProjection*/ ctx[3], false, false, false);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td);
    			append_dev(td, button);
    			append_dev(tr, t0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tr, null);
    			}

    			append_dev(tr, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*rows*/ 2 && button_data_id_value !== (button_data_id_value = /*row*/ ctx[6].id)) {
    				attr_dev(button, "data-id", button_data_id_value);
    			}

    			if (dirty & /*rows*/ 2) {
    				set_style(td, "background-color", /*row*/ ctx[6].color);
    			}

    			if (dirty & /*parametersDifferent, columnOrder, options, rows*/ 7) {
    				each_value_1 = /*columnOrder*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tr, t1);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    			destroy_each(each_blocks, detaching);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(55:6) {#each rows as row}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let table;
    	let thead;
    	let tr;
    	let th;
    	let t0;
    	let t1;
    	let tbody;
    	let each_value_2 = /*columnOrder*/ ctx[0];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_1[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value = /*rows*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th = element("th");
    			t0 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t1 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(th, file$1, 47, 8, 1346);
    			add_location(tr, file$1, 46, 6, 1332);
    			add_location(thead, file$1, 45, 4, 1317);
    			add_location(tbody, file$1, 53, 4, 1489);
    			attr_dev(table, "class", "table is-narrow");
    			attr_dev(table, "id", "line-chart-table");
    			add_location(table, file$1, 44, 2, 1258);
    			attr_dev(div, "class", "table-container");
    			add_location(div, file$1, 43, 0, 1225);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th);
    			append_dev(tr, t0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(tr, null);
    			}

    			append_dev(table, t1);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*options, columnOrder*/ 1) {
    				each_value_2 = /*columnOrder*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_2(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(tr, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_2.length;
    			}

    			if (dirty & /*columnOrder, parametersDifferent, options, rows, handleDeleteProjection*/ 15) {
    				each_value = /*rows*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { legendData } = $$props;

    	function handleDeleteProjection(e) {
    		dispatch("deleteProjection", e.target.getAttribute("data-id"));
    	}

    	const writable_props = ["legendData"];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<LineChartLegendTable> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("legendData" in $$props) $$invalidate(4, legendData = $$props.legendData);
    	};

    	$$self.$capture_state = () => {
    		return {
    			legendData,
    			columnOrder,
    			rows,
    			parametersDifferent
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("legendData" in $$props) $$invalidate(4, legendData = $$props.legendData);
    		if ("columnOrder" in $$props) $$invalidate(0, columnOrder = $$props.columnOrder);
    		if ("rows" in $$props) $$invalidate(1, rows = $$props.rows);
    		if ("parametersDifferent" in $$props) $$invalidate(2, parametersDifferent = $$props.parametersDifferent);
    	};

    	let columnOrder;
    	let rows;
    	let parametersDifferent;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*legendData*/ 16) {
    			 $$invalidate(0, columnOrder = [
    				"type",
    				"education",
    				"rateOrTotal",
    				"fteOrHeadcount",
    				"location",
    				"setting",
    				...legendData[0].params.filter(d => d[0].includes("Scenario")).map(d => d[0])
    			]);
    		}

    		if ($$self.$$.dirty & /*legendData*/ 16) {
    			 $$invalidate(1, rows = legendData.map(d => Object.assign({ paramsMap: new Map(d.params) }, d)));
    		}

    		if ($$self.$$.dirty & /*legendData*/ 16) {
    			 $$invalidate(2, parametersDifferent = rollup(legendData.map(d => d.params).flat(), v => new Set(v.map(e => e[1])).size > 1, d => d[0]));
    		}
    	};

    	return [columnOrder, rows, parametersDifferent, handleDeleteProjection, legendData];
    }

    class LineChartLegendTable extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { legendData: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "LineChartLegendTable",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*legendData*/ ctx[4] === undefined && !("legendData" in props)) {
    			console.warn("<LineChartLegendTable> was created without expected prop 'legendData'");
    		}
    	}

    	get legendData() {
    		throw new Error("<LineChartLegendTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set legendData(value) {
    		throw new Error("<LineChartLegendTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\DifferenceToolTipTable.svelte generated by Svelte v3.16.0 */
    const file$2 = "src\\DifferenceToolTipTable.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i].supplyMean;
    	child_ctx[2] = list[i].demandMean;
    	child_ctx[3] = list[i].value;
    	child_ctx[4] = list[i].color;
    	child_ctx[5] = list[i].rateOrTotal;
    	child_ctx[6] = list[i].percentage;
    	child_ctx[7] = list[i].difference;
    	return child_ctx;
    }

    // (18:6) {#each rows as { supplyMean, demandMean, value, color, rateOrTotal, percentage, difference }}
    function create_each_block$1(ctx) {
    	let tr;
    	let td0;
    	let t0_value = numberFormat(/*rateOrTotal*/ ctx[5])(/*supplyMean*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = numberFormat(/*rateOrTotal*/ ctx[5])(/*demandMean*/ ctx[2]) + "";
    	let t2;
    	let t3;
    	let td2;
    	let t4_value = numberFormat(/*rateOrTotal*/ ctx[5])(/*difference*/ ctx[7] || /*value*/ ctx[3]) + "";
    	let t4;
    	let t5;
    	let td3;

    	let t6_value = (/*percentage*/ ctx[6] || /*value*/ ctx[3]).toLocaleString(undefined, {
    		style: "percent",
    		maximumFractionDigits: 1
    	}) + "";

    	let t6;
    	let t7;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			t5 = space();
    			td3 = element("td");
    			t6 = text(t6_value);
    			t7 = space();
    			set_style(td0, "color", /*color*/ ctx[4]);
    			set_style(td0, "text-align", "right");
    			attr_dev(td0, "class", "svelte-1j89okb");
    			add_location(td0, file$2, 19, 10, 554);
    			set_style(td1, "color", /*color*/ ctx[4]);
    			set_style(td1, "text-align", "right");
    			attr_dev(td1, "class", "svelte-1j89okb");
    			add_location(td1, file$2, 22, 10, 681);
    			set_style(td2, "color", /*color*/ ctx[4]);
    			set_style(td2, "text-align", "right");
    			attr_dev(td2, "class", "svelte-1j89okb");
    			add_location(td2, file$2, 25, 10, 808);
    			set_style(td3, "color", /*color*/ ctx[4]);
    			set_style(td3, "text-align", "right");
    			attr_dev(td3, "class", "svelte-1j89okb");
    			add_location(td3, file$2, 28, 10, 944);
    			add_location(tr, file$2, 18, 8, 538);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, t2);
    			append_dev(tr, t3);
    			append_dev(tr, td2);
    			append_dev(td2, t4);
    			append_dev(tr, t5);
    			append_dev(tr, td3);
    			append_dev(td3, t6);
    			append_dev(tr, t7);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*rows*/ 1 && t0_value !== (t0_value = numberFormat(/*rateOrTotal*/ ctx[5])(/*supplyMean*/ ctx[1]) + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*rows*/ 1) {
    				set_style(td0, "color", /*color*/ ctx[4]);
    			}

    			if (dirty & /*rows*/ 1 && t2_value !== (t2_value = numberFormat(/*rateOrTotal*/ ctx[5])(/*demandMean*/ ctx[2]) + "")) set_data_dev(t2, t2_value);

    			if (dirty & /*rows*/ 1) {
    				set_style(td1, "color", /*color*/ ctx[4]);
    			}

    			if (dirty & /*rows*/ 1 && t4_value !== (t4_value = numberFormat(/*rateOrTotal*/ ctx[5])(/*difference*/ ctx[7] || /*value*/ ctx[3]) + "")) set_data_dev(t4, t4_value);

    			if (dirty & /*rows*/ 1) {
    				set_style(td2, "color", /*color*/ ctx[4]);
    			}

    			if (dirty & /*rows*/ 1 && t6_value !== (t6_value = (/*percentage*/ ctx[6] || /*value*/ ctx[3]).toLocaleString(undefined, {
    				style: "percent",
    				maximumFractionDigits: 1
    			}) + "")) set_data_dev(t6, t6_value);

    			if (dirty & /*rows*/ 1) {
    				set_style(td3, "color", /*color*/ ctx[4]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(18:6) {#each rows as { supplyMean, demandMean, value, color, rateOrTotal, percentage, difference }}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t1;
    	let th1;
    	let t3;
    	let th2;
    	let t5;
    	let th3;
    	let t7;
    	let tbody;
    	let each_value = /*rows*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			th0.textContent = "Supply";
    			t1 = space();
    			th1 = element("th");
    			th1.textContent = "Demand";
    			t3 = space();
    			th2 = element("th");
    			th2.textContent = "Difference";
    			t5 = space();
    			th3 = element("th");
    			th3.textContent = "%";
    			t7 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			set_style(th0, "text-align", "right");
    			add_location(th0, file$2, 10, 8, 194);
    			set_style(th1, "text-align", "right");
    			add_location(th1, file$2, 11, 8, 245);
    			set_style(th2, "text-align", "right");
    			add_location(th2, file$2, 12, 8, 296);
    			set_style(th3, "text-align", "right");
    			add_location(th3, file$2, 13, 8, 351);
    			add_location(tr, file$2, 9, 6, 180);
    			add_location(thead, file$2, 8, 4, 165);
    			add_location(tbody, file$2, 16, 4, 420);
    			attr_dev(table, "class", "table is-narrow");
    			add_location(table, file$2, 7, 2, 128);
    			attr_dev(div, "class", "table-container");
    			add_location(div, file$2, 6, 0, 95);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t1);
    			append_dev(tr, th1);
    			append_dev(tr, t3);
    			append_dev(tr, th2);
    			append_dev(tr, t5);
    			append_dev(tr, th3);
    			append_dev(table, t7);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*rows, undefined, numberFormat*/ 1) {
    				each_value = /*rows*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { rows } = $$props;
    	const writable_props = ["rows"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<DifferenceToolTipTable> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("rows" in $$props) $$invalidate(0, rows = $$props.rows);
    	};

    	$$self.$capture_state = () => {
    		return { rows };
    	};

    	$$self.$inject_state = $$props => {
    		if ("rows" in $$props) $$invalidate(0, rows = $$props.rows);
    	};

    	return [rows];
    }

    class DifferenceToolTipTable extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { rows: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "DifferenceToolTipTable",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*rows*/ ctx[0] === undefined && !("rows" in props)) {
    			console.warn("<DifferenceToolTipTable> was created without expected prop 'rows'");
    		}
    	}

    	get rows() {
    		throw new Error("<DifferenceToolTipTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rows(value) {
    		throw new Error("<DifferenceToolTipTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function initRange(domain, range) {
      switch (arguments.length) {
        case 0: break;
        case 1: this.range(domain); break;
        default: this.range(range).domain(domain); break;
      }
      return this;
    }

    const implicit = Symbol("implicit");

    function ordinal() {
      var index = new Map(),
          domain = [],
          range = [],
          unknown = implicit;

      function scale(d) {
        var key = d + "", i = index.get(key);
        if (!i) {
          if (unknown !== implicit) return unknown;
          index.set(key, i = domain.push(d));
        }
        return range[(i - 1) % range.length];
      }

      scale.domain = function(_) {
        if (!arguments.length) return domain.slice();
        domain = [], index = new Map();
        for (const value of _) {
          const key = value + "";
          if (index.has(key)) continue;
          index.set(key, domain.push(value));
        }
        return scale;
      };

      scale.range = function(_) {
        return arguments.length ? (range = Array.from(_), scale) : range.slice();
      };

      scale.unknown = function(_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      scale.copy = function() {
        return ordinal(domain, range).unknown(unknown);
      };

      initRange.apply(scale, arguments);

      return scale;
    }

    function band() {
      var scale = ordinal().unknown(undefined),
          domain = scale.domain,
          ordinalRange = scale.range,
          r0 = 0,
          r1 = 1,
          step,
          bandwidth,
          round = false,
          paddingInner = 0,
          paddingOuter = 0,
          align = 0.5;

      delete scale.unknown;

      function rescale() {
        var n = domain().length,
            reverse = r1 < r0,
            start = reverse ? r1 : r0,
            stop = reverse ? r0 : r1;
        step = (stop - start) / Math.max(1, n - paddingInner + paddingOuter * 2);
        if (round) step = Math.floor(step);
        start += (stop - start - step * (n - paddingInner)) * align;
        bandwidth = step * (1 - paddingInner);
        if (round) start = Math.round(start), bandwidth = Math.round(bandwidth);
        var values = range(n).map(function(i) { return start + step * i; });
        return ordinalRange(reverse ? values.reverse() : values);
      }

      scale.domain = function(_) {
        return arguments.length ? (domain(_), rescale()) : domain();
      };

      scale.range = function(_) {
        return arguments.length ? ([r0, r1] = _, r0 = +r0, r1 = +r1, rescale()) : [r0, r1];
      };

      scale.rangeRound = function(_) {
        return [r0, r1] = _, r0 = +r0, r1 = +r1, round = true, rescale();
      };

      scale.bandwidth = function() {
        return bandwidth;
      };

      scale.step = function() {
        return step;
      };

      scale.round = function(_) {
        return arguments.length ? (round = !!_, rescale()) : round;
      };

      scale.padding = function(_) {
        return arguments.length ? (paddingInner = Math.min(1, paddingOuter = +_), rescale()) : paddingInner;
      };

      scale.paddingInner = function(_) {
        return arguments.length ? (paddingInner = Math.min(1, _), rescale()) : paddingInner;
      };

      scale.paddingOuter = function(_) {
        return arguments.length ? (paddingOuter = +_, rescale()) : paddingOuter;
      };

      scale.align = function(_) {
        return arguments.length ? (align = Math.max(0, Math.min(1, _)), rescale()) : align;
      };

      scale.copy = function() {
        return band(domain(), [r0, r1])
            .round(round)
            .paddingInner(paddingInner)
            .paddingOuter(paddingOuter)
            .align(align);
      };

      return initRange.apply(rescale(), arguments);
    }

    function constant$1(x) {
      return function() {
        return x;
      };
    }

    function number(x) {
      return +x;
    }

    var unit = [0, 1];

    function identity$2(x) {
      return x;
    }

    function normalize(a, b) {
      return (b -= (a = +a))
          ? function(x) { return (x - a) / b; }
          : constant$1(isNaN(b) ? NaN : 0.5);
    }

    function clamper(a, b) {
      var t;
      if (a > b) t = a, a = b, b = t;
      return function(x) { return Math.max(a, Math.min(b, x)); };
    }

    // normalize(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
    // interpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding range value x in [a,b].
    function bimap(domain, range, interpolate) {
      var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
      if (d1 < d0) d0 = normalize(d1, d0), r0 = interpolate(r1, r0);
      else d0 = normalize(d0, d1), r0 = interpolate(r0, r1);
      return function(x) { return r0(d0(x)); };
    }

    function polymap(domain, range, interpolate) {
      var j = Math.min(domain.length, range.length) - 1,
          d = new Array(j),
          r = new Array(j),
          i = -1;

      // Reverse descending domains.
      if (domain[j] < domain[0]) {
        domain = domain.slice().reverse();
        range = range.slice().reverse();
      }

      while (++i < j) {
        d[i] = normalize(domain[i], domain[i + 1]);
        r[i] = interpolate(range[i], range[i + 1]);
      }

      return function(x) {
        var i = bisectRight(domain, x, 1, j) - 1;
        return r[i](d[i](x));
      };
    }

    function copy(source, target) {
      return target
          .domain(source.domain())
          .range(source.range())
          .interpolate(source.interpolate())
          .clamp(source.clamp())
          .unknown(source.unknown());
    }

    function transformer() {
      var domain = unit,
          range = unit,
          interpolate$1 = interpolate,
          transform,
          untransform,
          unknown,
          clamp = identity$2,
          piecewise,
          output,
          input;

      function rescale() {
        var n = Math.min(domain.length, range.length);
        if (clamp !== identity$2) clamp = clamper(domain[0], domain[n - 1]);
        piecewise = n > 2 ? polymap : bimap;
        output = input = null;
        return scale;
      }

      function scale(x) {
        return isNaN(x = +x) ? unknown : (output || (output = piecewise(domain.map(transform), range, interpolate$1)))(transform(clamp(x)));
      }

      scale.invert = function(y) {
        return clamp(untransform((input || (input = piecewise(range, domain.map(transform), interpolateNumber)))(y)));
      };

      scale.domain = function(_) {
        return arguments.length ? (domain = Array.from(_, number), rescale()) : domain.slice();
      };

      scale.range = function(_) {
        return arguments.length ? (range = Array.from(_), rescale()) : range.slice();
      };

      scale.rangeRound = function(_) {
        return range = Array.from(_), interpolate$1 = interpolateRound, rescale();
      };

      scale.clamp = function(_) {
        return arguments.length ? (clamp = _ ? true : identity$2, rescale()) : clamp !== identity$2;
      };

      scale.interpolate = function(_) {
        return arguments.length ? (interpolate$1 = _, rescale()) : interpolate$1;
      };

      scale.unknown = function(_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      return function(t, u) {
        transform = t, untransform = u;
        return rescale();
      };
    }

    function continuous() {
      return transformer()(identity$2, identity$2);
    }

    // Computes the decimal coefficient and exponent of the specified number x with
    // significant digits p, where x is positive and p is in [1, 21] or undefined.
    // For example, formatDecimal(1.23) returns ["123", 0].
    function formatDecimal(x, p) {
      if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
      var i, coefficient = x.slice(0, i);

      // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
      // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
      return [
        coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
        +x.slice(i + 1)
      ];
    }

    function exponent(x) {
      return x = formatDecimal(Math.abs(x)), x ? x[1] : NaN;
    }

    function formatGroup(grouping, thousands) {
      return function(value, width) {
        var i = value.length,
            t = [],
            j = 0,
            g = grouping[0],
            length = 0;

        while (i > 0 && g > 0) {
          if (length + g + 1 > width) g = Math.max(1, width - length);
          t.push(value.substring(i -= g, i + g));
          if ((length += g + 1) > width) break;
          g = grouping[j = (j + 1) % grouping.length];
        }

        return t.reverse().join(thousands);
      };
    }

    function formatNumerals(numerals) {
      return function(value) {
        return value.replace(/[0-9]/g, function(i) {
          return numerals[+i];
        });
      };
    }

    // [[fill]align][sign][symbol][0][width][,][.precision][~][type]
    var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

    function formatSpecifier(specifier) {
      if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
      var match;
      return new FormatSpecifier({
        fill: match[1],
        align: match[2],
        sign: match[3],
        symbol: match[4],
        zero: match[5],
        width: match[6],
        comma: match[7],
        precision: match[8] && match[8].slice(1),
        trim: match[9],
        type: match[10]
      });
    }

    formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

    function FormatSpecifier(specifier) {
      this.fill = specifier.fill === undefined ? " " : specifier.fill + "";
      this.align = specifier.align === undefined ? ">" : specifier.align + "";
      this.sign = specifier.sign === undefined ? "-" : specifier.sign + "";
      this.symbol = specifier.symbol === undefined ? "" : specifier.symbol + "";
      this.zero = !!specifier.zero;
      this.width = specifier.width === undefined ? undefined : +specifier.width;
      this.comma = !!specifier.comma;
      this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
      this.trim = !!specifier.trim;
      this.type = specifier.type === undefined ? "" : specifier.type + "";
    }

    FormatSpecifier.prototype.toString = function() {
      return this.fill
          + this.align
          + this.sign
          + this.symbol
          + (this.zero ? "0" : "")
          + (this.width === undefined ? "" : Math.max(1, this.width | 0))
          + (this.comma ? "," : "")
          + (this.precision === undefined ? "" : "." + Math.max(0, this.precision | 0))
          + (this.trim ? "~" : "")
          + this.type;
    };

    // Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
    function formatTrim(s) {
      out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
        switch (s[i]) {
          case ".": i0 = i1 = i; break;
          case "0": if (i0 === 0) i0 = i; i1 = i; break;
          default: if (!+s[i]) break out; if (i0 > 0) i0 = 0; break;
        }
      }
      return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
    }

    var prefixExponent;

    function formatPrefixAuto(x, p) {
      var d = formatDecimal(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1],
          i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
          n = coefficient.length;
      return i === n ? coefficient
          : i > n ? coefficient + new Array(i - n + 1).join("0")
          : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
          : "0." + new Array(1 - i).join("0") + formatDecimal(x, Math.max(0, p + i - 1))[0]; // less than 1y!
    }

    function formatRounded(x, p) {
      var d = formatDecimal(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1];
      return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
          : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
          : coefficient + new Array(exponent - coefficient.length + 2).join("0");
    }

    var formatTypes = {
      "%": function(x, p) { return (x * 100).toFixed(p); },
      "b": function(x) { return Math.round(x).toString(2); },
      "c": function(x) { return x + ""; },
      "d": function(x) { return Math.round(x).toString(10); },
      "e": function(x, p) { return x.toExponential(p); },
      "f": function(x, p) { return x.toFixed(p); },
      "g": function(x, p) { return x.toPrecision(p); },
      "o": function(x) { return Math.round(x).toString(8); },
      "p": function(x, p) { return formatRounded(x * 100, p); },
      "r": formatRounded,
      "s": formatPrefixAuto,
      "X": function(x) { return Math.round(x).toString(16).toUpperCase(); },
      "x": function(x) { return Math.round(x).toString(16); }
    };

    function identity$3(x) {
      return x;
    }

    var map = Array.prototype.map,
        prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

    function formatLocale(locale) {
      var group = locale.grouping === undefined || locale.thousands === undefined ? identity$3 : formatGroup(map.call(locale.grouping, Number), locale.thousands + ""),
          currencyPrefix = locale.currency === undefined ? "" : locale.currency[0] + "",
          currencySuffix = locale.currency === undefined ? "" : locale.currency[1] + "",
          decimal = locale.decimal === undefined ? "." : locale.decimal + "",
          numerals = locale.numerals === undefined ? identity$3 : formatNumerals(map.call(locale.numerals, String)),
          percent = locale.percent === undefined ? "%" : locale.percent + "",
          minus = locale.minus === undefined ? "-" : locale.minus + "",
          nan = locale.nan === undefined ? "NaN" : locale.nan + "";

      function newFormat(specifier) {
        specifier = formatSpecifier(specifier);

        var fill = specifier.fill,
            align = specifier.align,
            sign = specifier.sign,
            symbol = specifier.symbol,
            zero = specifier.zero,
            width = specifier.width,
            comma = specifier.comma,
            precision = specifier.precision,
            trim = specifier.trim,
            type = specifier.type;

        // The "n" type is an alias for ",g".
        if (type === "n") comma = true, type = "g";

        // The "" type, and any invalid type, is an alias for ".12~g".
        else if (!formatTypes[type]) precision === undefined && (precision = 12), trim = true, type = "g";

        // If zero fill is specified, padding goes after sign and before digits.
        if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

        // Compute the prefix and suffix.
        // For SI-prefix, the suffix is lazily computed.
        var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
            suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : "";

        // What format function should we use?
        // Is this an integer type?
        // Can this type generate exponential notation?
        var formatType = formatTypes[type],
            maybeSuffix = /[defgprs%]/.test(type);

        // Set the default precision if not specified,
        // or clamp the specified precision to the supported range.
        // For significant precision, it must be in [1, 21].
        // For fixed precision, it must be in [0, 20].
        precision = precision === undefined ? 6
            : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
            : Math.max(0, Math.min(20, precision));

        function format(value) {
          var valuePrefix = prefix,
              valueSuffix = suffix,
              i, n, c;

          if (type === "c") {
            valueSuffix = formatType(value) + valueSuffix;
            value = "";
          } else {
            value = +value;

            // Perform the initial formatting.
            var valueNegative = value < 0;
            value = isNaN(value) ? nan : formatType(Math.abs(value), precision);

            // Trim insignificant zeros.
            if (trim) value = formatTrim(value);

            // If a negative value rounds to zero during formatting, treat as positive.
            if (valueNegative && +value === 0) valueNegative = false;

            // Compute the prefix and suffix.
            valuePrefix = (valueNegative ? (sign === "(" ? sign : minus) : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;

            valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");

            // Break the formatted value into the integer “value” part that can be
            // grouped, and fractional or exponential “suffix” part that is not.
            if (maybeSuffix) {
              i = -1, n = value.length;
              while (++i < n) {
                if (c = value.charCodeAt(i), 48 > c || c > 57) {
                  valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
                  value = value.slice(0, i);
                  break;
                }
              }
            }
          }

          // If the fill character is not "0", grouping is applied before padding.
          if (comma && !zero) value = group(value, Infinity);

          // Compute the padding.
          var length = valuePrefix.length + value.length + valueSuffix.length,
              padding = length < width ? new Array(width - length + 1).join(fill) : "";

          // If the fill character is "0", grouping is applied after padding.
          if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

          // Reconstruct the final output based on the desired alignment.
          switch (align) {
            case "<": value = valuePrefix + value + valueSuffix + padding; break;
            case "=": value = valuePrefix + padding + value + valueSuffix; break;
            case "^": value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length); break;
            default: value = padding + valuePrefix + value + valueSuffix; break;
          }

          return numerals(value);
        }

        format.toString = function() {
          return specifier + "";
        };

        return format;
      }

      function formatPrefix(specifier, value) {
        var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
            e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
            k = Math.pow(10, -e),
            prefix = prefixes[8 + e / 3];
        return function(value) {
          return f(k * value) + prefix;
        };
      }

      return {
        format: newFormat,
        formatPrefix: formatPrefix
      };
    }

    var locale;
    var format;
    var formatPrefix;

    defaultLocale({
      decimal: ".",
      thousands: ",",
      grouping: [3],
      currency: ["$", ""],
      minus: "-"
    });

    function defaultLocale(definition) {
      locale = formatLocale(definition);
      format = locale.format;
      formatPrefix = locale.formatPrefix;
      return locale;
    }

    function precisionFixed(step) {
      return Math.max(0, -exponent(Math.abs(step)));
    }

    function precisionPrefix(step, value) {
      return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
    }

    function precisionRound(step, max) {
      step = Math.abs(step), max = Math.abs(max) - step;
      return Math.max(0, exponent(max) - exponent(step)) + 1;
    }

    function tickFormat(start, stop, count, specifier) {
      var step = tickStep(start, stop, count),
          precision;
      specifier = formatSpecifier(specifier == null ? ",f" : specifier);
      switch (specifier.type) {
        case "s": {
          var value = Math.max(Math.abs(start), Math.abs(stop));
          if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value))) specifier.precision = precision;
          return formatPrefix(specifier, value);
        }
        case "":
        case "e":
        case "g":
        case "p":
        case "r": {
          if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start), Math.abs(stop))))) specifier.precision = precision - (specifier.type === "e");
          break;
        }
        case "f":
        case "%": {
          if (specifier.precision == null && !isNaN(precision = precisionFixed(step))) specifier.precision = precision - (specifier.type === "%") * 2;
          break;
        }
      }
      return format(specifier);
    }

    function linearish(scale) {
      var domain = scale.domain;

      scale.ticks = function(count) {
        var d = domain();
        return ticks(d[0], d[d.length - 1], count == null ? 10 : count);
      };

      scale.tickFormat = function(count, specifier) {
        var d = domain();
        return tickFormat(d[0], d[d.length - 1], count == null ? 10 : count, specifier);
      };

      scale.nice = function(count) {
        if (count == null) count = 10;

        var d = domain(),
            i0 = 0,
            i1 = d.length - 1,
            start = d[i0],
            stop = d[i1],
            step;

        if (stop < start) {
          step = start, start = stop, stop = step;
          step = i0, i0 = i1, i1 = step;
        }

        step = tickIncrement(start, stop, count);

        if (step > 0) {
          start = Math.floor(start / step) * step;
          stop = Math.ceil(stop / step) * step;
          step = tickIncrement(start, stop, count);
        } else if (step < 0) {
          start = Math.ceil(start * step) / step;
          stop = Math.floor(stop * step) / step;
          step = tickIncrement(start, stop, count);
        }

        if (step > 0) {
          d[i0] = Math.floor(start / step) * step;
          d[i1] = Math.ceil(stop / step) * step;
          domain(d);
        } else if (step < 0) {
          d[i0] = Math.ceil(start * step) / step;
          d[i1] = Math.floor(stop * step) / step;
          domain(d);
        }

        return scale;
      };

      return scale;
    }

    function linear$1() {
      var scale = continuous();

      scale.copy = function() {
        return copy(scale, linear$1());
      };

      initRange.apply(scale, arguments);

      return linearish(scale);
    }

    var pi = Math.PI,
        tau = 2 * pi,
        epsilon = 1e-6,
        tauEpsilon = tau - epsilon;

    function Path() {
      this._x0 = this._y0 = // start of current subpath
      this._x1 = this._y1 = null; // end of current subpath
      this._ = "";
    }

    function path() {
      return new Path;
    }

    Path.prototype = path.prototype = {
      constructor: Path,
      moveTo: function(x, y) {
        this._ += "M" + (this._x0 = this._x1 = +x) + "," + (this._y0 = this._y1 = +y);
      },
      closePath: function() {
        if (this._x1 !== null) {
          this._x1 = this._x0, this._y1 = this._y0;
          this._ += "Z";
        }
      },
      lineTo: function(x, y) {
        this._ += "L" + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      quadraticCurveTo: function(x1, y1, x, y) {
        this._ += "Q" + (+x1) + "," + (+y1) + "," + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      bezierCurveTo: function(x1, y1, x2, y2, x, y) {
        this._ += "C" + (+x1) + "," + (+y1) + "," + (+x2) + "," + (+y2) + "," + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      arcTo: function(x1, y1, x2, y2, r) {
        x1 = +x1, y1 = +y1, x2 = +x2, y2 = +y2, r = +r;
        var x0 = this._x1,
            y0 = this._y1,
            x21 = x2 - x1,
            y21 = y2 - y1,
            x01 = x0 - x1,
            y01 = y0 - y1,
            l01_2 = x01 * x01 + y01 * y01;

        // Is the radius negative? Error.
        if (r < 0) throw new Error("negative radius: " + r);

        // Is this path empty? Move to (x1,y1).
        if (this._x1 === null) {
          this._ += "M" + (this._x1 = x1) + "," + (this._y1 = y1);
        }

        // Or, is (x1,y1) coincident with (x0,y0)? Do nothing.
        else if (!(l01_2 > epsilon));

        // Or, are (x0,y0), (x1,y1) and (x2,y2) collinear?
        // Equivalently, is (x1,y1) coincident with (x2,y2)?
        // Or, is the radius zero? Line to (x1,y1).
        else if (!(Math.abs(y01 * x21 - y21 * x01) > epsilon) || !r) {
          this._ += "L" + (this._x1 = x1) + "," + (this._y1 = y1);
        }

        // Otherwise, draw an arc!
        else {
          var x20 = x2 - x0,
              y20 = y2 - y0,
              l21_2 = x21 * x21 + y21 * y21,
              l20_2 = x20 * x20 + y20 * y20,
              l21 = Math.sqrt(l21_2),
              l01 = Math.sqrt(l01_2),
              l = r * Math.tan((pi - Math.acos((l21_2 + l01_2 - l20_2) / (2 * l21 * l01))) / 2),
              t01 = l / l01,
              t21 = l / l21;

          // If the start tangent is not coincident with (x0,y0), line to.
          if (Math.abs(t01 - 1) > epsilon) {
            this._ += "L" + (x1 + t01 * x01) + "," + (y1 + t01 * y01);
          }

          this._ += "A" + r + "," + r + ",0,0," + (+(y01 * x20 > x01 * y20)) + "," + (this._x1 = x1 + t21 * x21) + "," + (this._y1 = y1 + t21 * y21);
        }
      },
      arc: function(x, y, r, a0, a1, ccw) {
        x = +x, y = +y, r = +r, ccw = !!ccw;
        var dx = r * Math.cos(a0),
            dy = r * Math.sin(a0),
            x0 = x + dx,
            y0 = y + dy,
            cw = 1 ^ ccw,
            da = ccw ? a0 - a1 : a1 - a0;

        // Is the radius negative? Error.
        if (r < 0) throw new Error("negative radius: " + r);

        // Is this path empty? Move to (x0,y0).
        if (this._x1 === null) {
          this._ += "M" + x0 + "," + y0;
        }

        // Or, is (x0,y0) not coincident with the previous point? Line to (x0,y0).
        else if (Math.abs(this._x1 - x0) > epsilon || Math.abs(this._y1 - y0) > epsilon) {
          this._ += "L" + x0 + "," + y0;
        }

        // Is this arc empty? We’re done.
        if (!r) return;

        // Does the angle go the wrong way? Flip the direction.
        if (da < 0) da = da % tau + tau;

        // Is this a complete circle? Draw two arcs to complete the circle.
        if (da > tauEpsilon) {
          this._ += "A" + r + "," + r + ",0,1," + cw + "," + (x - dx) + "," + (y - dy) + "A" + r + "," + r + ",0,1," + cw + "," + (this._x1 = x0) + "," + (this._y1 = y0);
        }

        // Is this arc non-empty? Draw an arc!
        else if (da > epsilon) {
          this._ += "A" + r + "," + r + ",0," + (+(da >= pi)) + "," + cw + "," + (this._x1 = x + r * Math.cos(a1)) + "," + (this._y1 = y + r * Math.sin(a1));
        }
      },
      rect: function(x, y, w, h) {
        this._ += "M" + (this._x0 = this._x1 = +x) + "," + (this._y0 = this._y1 = +y) + "h" + (+w) + "v" + (+h) + "h" + (-w) + "Z";
      },
      toString: function() {
        return this._;
      }
    };

    function constant$2(x) {
      return function constant() {
        return x;
      };
    }

    function Linear(context) {
      this._context = context;
    }

    Linear.prototype = {
      areaStart: function() {
        this._line = 0;
      },
      areaEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._point = 0;
      },
      lineEnd: function() {
        if (this._line || (this._line !== 0 && this._point === 1)) this._context.closePath();
        this._line = 1 - this._line;
      },
      point: function(x, y) {
        x = +x, y = +y;
        switch (this._point) {
          case 0: this._point = 1; this._line ? this._context.lineTo(x, y) : this._context.moveTo(x, y); break;
          case 1: this._point = 2; // proceed
          default: this._context.lineTo(x, y); break;
        }
      }
    };

    function curveLinear(context) {
      return new Linear(context);
    }

    function x(p) {
      return p[0];
    }

    function y(p) {
      return p[1];
    }

    function d3line() {
      var x$1 = x,
          y$1 = y,
          defined = constant$2(true),
          context = null,
          curve = curveLinear,
          output = null;

      function line(data) {
        var i,
            n = data.length,
            d,
            defined0 = false,
            buffer;

        if (context == null) output = curve(buffer = path());

        for (i = 0; i <= n; ++i) {
          if (!(i < n && defined(d = data[i], i, data)) === defined0) {
            if (defined0 = !defined0) output.lineStart();
            else output.lineEnd();
          }
          if (defined0) output.point(+x$1(d, i, data), +y$1(d, i, data));
        }

        if (buffer) return output = null, buffer + "" || null;
      }

      line.x = function(_) {
        return arguments.length ? (x$1 = typeof _ === "function" ? _ : constant$2(+_), line) : x$1;
      };

      line.y = function(_) {
        return arguments.length ? (y$1 = typeof _ === "function" ? _ : constant$2(+_), line) : y$1;
      };

      line.defined = function(_) {
        return arguments.length ? (defined = typeof _ === "function" ? _ : constant$2(!!_), line) : defined;
      };

      line.curve = function(_) {
        return arguments.length ? (curve = _, context != null && (output = curve(context)), line) : curve;
      };

      line.context = function(_) {
        return arguments.length ? (_ == null ? context = output = null : output = curve(context = _), line) : context;
      };

      return line;
    }

    function d3area() {
      var x0 = x,
          x1 = null,
          y0 = constant$2(0),
          y1 = y,
          defined = constant$2(true),
          context = null,
          curve = curveLinear,
          output = null;

      function area(data) {
        var i,
            j,
            k,
            n = data.length,
            d,
            defined0 = false,
            buffer,
            x0z = new Array(n),
            y0z = new Array(n);

        if (context == null) output = curve(buffer = path());

        for (i = 0; i <= n; ++i) {
          if (!(i < n && defined(d = data[i], i, data)) === defined0) {
            if (defined0 = !defined0) {
              j = i;
              output.areaStart();
              output.lineStart();
            } else {
              output.lineEnd();
              output.lineStart();
              for (k = i - 1; k >= j; --k) {
                output.point(x0z[k], y0z[k]);
              }
              output.lineEnd();
              output.areaEnd();
            }
          }
          if (defined0) {
            x0z[i] = +x0(d, i, data), y0z[i] = +y0(d, i, data);
            output.point(x1 ? +x1(d, i, data) : x0z[i], y1 ? +y1(d, i, data) : y0z[i]);
          }
        }

        if (buffer) return output = null, buffer + "" || null;
      }

      function arealine() {
        return d3line().defined(defined).curve(curve).context(context);
      }

      area.x = function(_) {
        return arguments.length ? (x0 = typeof _ === "function" ? _ : constant$2(+_), x1 = null, area) : x0;
      };

      area.x0 = function(_) {
        return arguments.length ? (x0 = typeof _ === "function" ? _ : constant$2(+_), area) : x0;
      };

      area.x1 = function(_) {
        return arguments.length ? (x1 = _ == null ? null : typeof _ === "function" ? _ : constant$2(+_), area) : x1;
      };

      area.y = function(_) {
        return arguments.length ? (y0 = typeof _ === "function" ? _ : constant$2(+_), y1 = null, area) : y0;
      };

      area.y0 = function(_) {
        return arguments.length ? (y0 = typeof _ === "function" ? _ : constant$2(+_), area) : y0;
      };

      area.y1 = function(_) {
        return arguments.length ? (y1 = _ == null ? null : typeof _ === "function" ? _ : constant$2(+_), area) : y1;
      };

      area.lineX0 =
      area.lineY0 = function() {
        return arealine().x(x0).y(y0);
      };

      area.lineY1 = function() {
        return arealine().x(x0).y(y1);
      };

      area.lineX1 = function() {
        return arealine().x(x1).y(y0);
      };

      area.defined = function(_) {
        return arguments.length ? (defined = typeof _ === "function" ? _ : constant$2(!!_), area) : defined;
      };

      area.curve = function(_) {
        return arguments.length ? (curve = _, context != null && (output = curve(context)), area) : curve;
      };

      area.context = function(_) {
        return arguments.length ? (_ == null ? context = output = null : output = curve(context = _), area) : context;
      };

      return area;
    }

    function sign(x) {
      return x < 0 ? -1 : 1;
    }

    // Calculate the slopes of the tangents (Hermite-type interpolation) based on
    // the following paper: Steffen, M. 1990. A Simple Method for Monotonic
    // Interpolation in One Dimension. Astronomy and Astrophysics, Vol. 239, NO.
    // NOV(II), P. 443, 1990.
    function slope3(that, x2, y2) {
      var h0 = that._x1 - that._x0,
          h1 = x2 - that._x1,
          s0 = (that._y1 - that._y0) / (h0 || h1 < 0 && -0),
          s1 = (y2 - that._y1) / (h1 || h0 < 0 && -0),
          p = (s0 * h1 + s1 * h0) / (h0 + h1);
      return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
    }

    // Calculate a one-sided slope.
    function slope2(that, t) {
      var h = that._x1 - that._x0;
      return h ? (3 * (that._y1 - that._y0) / h - t) / 2 : t;
    }

    // According to https://en.wikipedia.org/wiki/Cubic_Hermite_spline#Representations
    // "you can express cubic Hermite interpolation in terms of cubic Bézier curves
    // with respect to the four values p0, p0 + m0 / 3, p1 - m1 / 3, p1".
    function point(that, t0, t1) {
      var x0 = that._x0,
          y0 = that._y0,
          x1 = that._x1,
          y1 = that._y1,
          dx = (x1 - x0) / 3;
      that._context.bezierCurveTo(x0 + dx, y0 + dx * t0, x1 - dx, y1 - dx * t1, x1, y1);
    }

    function MonotoneX(context) {
      this._context = context;
    }

    MonotoneX.prototype = {
      areaStart: function() {
        this._line = 0;
      },
      areaEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._x0 = this._x1 =
        this._y0 = this._y1 =
        this._t0 = NaN;
        this._point = 0;
      },
      lineEnd: function() {
        switch (this._point) {
          case 2: this._context.lineTo(this._x1, this._y1); break;
          case 3: point(this, this._t0, slope2(this, this._t0)); break;
        }
        if (this._line || (this._line !== 0 && this._point === 1)) this._context.closePath();
        this._line = 1 - this._line;
      },
      point: function(x, y) {
        var t1 = NaN;

        x = +x, y = +y;
        if (x === this._x1 && y === this._y1) return; // Ignore coincident points.
        switch (this._point) {
          case 0: this._point = 1; this._line ? this._context.lineTo(x, y) : this._context.moveTo(x, y); break;
          case 1: this._point = 2; break;
          case 2: this._point = 3; point(this, slope2(this, t1 = slope3(this, x, y)), t1); break;
          default: point(this, this._t0, t1 = slope3(this, x, y)); break;
        }

        this._x0 = this._x1, this._x1 = x;
        this._y0 = this._y1, this._y1 = y;
        this._t0 = t1;
      }
    };

    function MonotoneY(context) {
      this._context = new ReflectContext(context);
    }

    (MonotoneY.prototype = Object.create(MonotoneX.prototype)).point = function(x, y) {
      MonotoneX.prototype.point.call(this, y, x);
    };

    function ReflectContext(context) {
      this._context = context;
    }

    ReflectContext.prototype = {
      moveTo: function(x, y) { this._context.moveTo(y, x); },
      closePath: function() { this._context.closePath(); },
      lineTo: function(x, y) { this._context.lineTo(y, x); },
      bezierCurveTo: function(x1, y1, x2, y2, x, y) { this._context.bezierCurveTo(y1, x1, y2, x2, y, x); }
    };

    function monotoneX(context) {
      return new MonotoneX(context);
    }

    /* src\XTick.svelte generated by Svelte v3.16.0 */
    const file$3 = "src\\XTick.svelte";

    function create_fragment$3(ctx) {
    	let g;
    	let line;
    	let text_1;
    	let t;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t = text(/*value*/ ctx[0]);
    			attr_dev(line, "y2", "6");
    			add_location(line, file$3, 20, 2, 439);
    			attr_dev(text_1, "y", "9");
    			attr_dev(text_1, "dy", ".9em");
    			add_location(text_1, file$3, 21, 2, 458);
    			attr_dev(g, "class", "tick");
    			attr_dev(g, "transform", g_transform_value = "translate(" + /*$lineStore*/ ctx[1] + ")");
    			add_location(g, file$3, 19, 0, 383);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, line);
    			append_dev(g, text_1);
    			append_dev(text_1, t);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*value*/ 1) set_data_dev(t, /*value*/ ctx[0]);

    			if (dirty & /*$lineStore*/ 2 && g_transform_value !== (g_transform_value = "translate(" + /*$lineStore*/ ctx[1] + ")")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $lineStore;
    	let { duration } = $$props;
    	let { position } = $$props;
    	let { value } = $$props;
    	const options = { duration, easing: cubicInOut };
    	const lineStore = tweened(undefined, options);
    	validate_store(lineStore, "lineStore");
    	component_subscribe($$self, lineStore, value => $$invalidate(1, $lineStore = value));
    	const writable_props = ["duration", "position", "value"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<XTick> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("duration" in $$props) $$invalidate(2, duration = $$props.duration);
    		if ("position" in $$props) $$invalidate(3, position = $$props.position);
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    	};

    	$$self.$capture_state = () => {
    		return { duration, position, value, $lineStore };
    	};

    	$$self.$inject_state = $$props => {
    		if ("duration" in $$props) $$invalidate(2, duration = $$props.duration);
    		if ("position" in $$props) $$invalidate(3, position = $$props.position);
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("$lineStore" in $$props) lineStore.set($lineStore = $$props.$lineStore);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*position*/ 8) {
    			 lineStore.set(position);
    		}
    	};

    	return [value, $lineStore, duration, position];
    }

    class XTick extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { duration: 2, position: 3, value: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "XTick",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*duration*/ ctx[2] === undefined && !("duration" in props)) {
    			console.warn("<XTick> was created without expected prop 'duration'");
    		}

    		if (/*position*/ ctx[3] === undefined && !("position" in props)) {
    			console.warn("<XTick> was created without expected prop 'position'");
    		}

    		if (/*value*/ ctx[0] === undefined && !("value" in props)) {
    			console.warn("<XTick> was created without expected prop 'value'");
    		}
    	}

    	get duration() {
    		throw new Error("<XTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<XTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get position() {
    		throw new Error("<XTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set position(value) {
    		throw new Error("<XTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<XTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<XTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\YTick.svelte generated by Svelte v3.16.0 */
    const file$4 = "src\\YTick.svelte";

    function create_fragment$4(ctx) {
    	let g;
    	let line;
    	let text_1;
    	let t_value = /*format*/ ctx[2](/*value*/ ctx[0]) + "";
    	let t;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			attr_dev(line, "x2", /*chartWidth*/ ctx[1]);
    			add_location(line, file$4, 32, 2, 764);
    			attr_dev(text_1, "x", "-5");
    			attr_dev(text_1, "dy", "0.32em");
    			add_location(text_1, file$4, 33, 2, 792);
    			attr_dev(g, "class", "tick");
    			attr_dev(g, "opacity", "1");
    			attr_dev(g, "transform", g_transform_value = "translate(" + /*$lineStore*/ ctx[3] + ")");
    			add_location(g, file$4, 31, 0, 696);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, line);
    			append_dev(g, text_1);
    			append_dev(text_1, t);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*chartWidth*/ 2) {
    				attr_dev(line, "x2", /*chartWidth*/ ctx[1]);
    			}

    			if (dirty & /*format, value*/ 5 && t_value !== (t_value = /*format*/ ctx[2](/*value*/ ctx[0]) + "")) set_data_dev(t, t_value);

    			if (dirty & /*$lineStore*/ 8 && g_transform_value !== (g_transform_value = "translate(" + /*$lineStore*/ ctx[3] + ")")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $lineStore;
    	let { duration } = $$props;
    	let { y } = $$props;
    	let { value } = $$props;
    	let { chartWidth } = $$props;
    	let { format = val => val.toLocaleString() } = $$props;
    	const options = { duration, easing: cubicInOut };
    	const lineStore = tweened(undefined, options);
    	validate_store(lineStore, "lineStore");
    	component_subscribe($$self, lineStore, value => $$invalidate(3, $lineStore = value));
    	const writable_props = ["duration", "y", "value", "chartWidth", "format"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<YTick> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("duration" in $$props) $$invalidate(4, duration = $$props.duration);
    		if ("y" in $$props) $$invalidate(5, y = $$props.y);
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("chartWidth" in $$props) $$invalidate(1, chartWidth = $$props.chartWidth);
    		if ("format" in $$props) $$invalidate(2, format = $$props.format);
    	};

    	$$self.$capture_state = () => {
    		return {
    			duration,
    			y,
    			value,
    			chartWidth,
    			format,
    			$lineStore
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("duration" in $$props) $$invalidate(4, duration = $$props.duration);
    		if ("y" in $$props) $$invalidate(5, y = $$props.y);
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("chartWidth" in $$props) $$invalidate(1, chartWidth = $$props.chartWidth);
    		if ("format" in $$props) $$invalidate(2, format = $$props.format);
    		if ("$lineStore" in $$props) lineStore.set($lineStore = $$props.$lineStore);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*y, value*/ 33) {
    			 lineStore.set([0, y(value)]);
    		}
    	};

    	return [value, chartWidth, format, $lineStore, duration, y];
    }

    class YTick extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			duration: 4,
    			y: 5,
    			value: 0,
    			chartWidth: 1,
    			format: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "YTick",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*duration*/ ctx[4] === undefined && !("duration" in props)) {
    			console.warn("<YTick> was created without expected prop 'duration'");
    		}

    		if (/*y*/ ctx[5] === undefined && !("y" in props)) {
    			console.warn("<YTick> was created without expected prop 'y'");
    		}

    		if (/*value*/ ctx[0] === undefined && !("value" in props)) {
    			console.warn("<YTick> was created without expected prop 'value'");
    		}

    		if (/*chartWidth*/ ctx[1] === undefined && !("chartWidth" in props)) {
    			console.warn("<YTick> was created without expected prop 'chartWidth'");
    		}
    	}

    	get duration() {
    		throw new Error("<YTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<YTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<YTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<YTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<YTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<YTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get chartWidth() {
    		throw new Error("<YTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set chartWidth(value) {
    		throw new Error("<YTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get format() {
    		throw new Error("<YTick>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set format(value) {
    		throw new Error("<YTick>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    Array.prototype.flat||Object.defineProperty(Array.prototype,"flat",{configurable:!0,value:function r(){var t=isNaN(arguments[0])?1:Number(arguments[0]);return t?Array.prototype.reduce.call(this,function(a,e){return Array.isArray(e)?a.push.apply(a,r.call(e,t-1)):a.push(e),a},[]):Array.prototype.slice.call(this)},writable:!0}),Array.prototype.flatMap||Object.defineProperty(Array.prototype,"flatMap",{configurable:!0,value:function(r){return Array.prototype.map.apply(this,arguments).flat()},writable:!0});

    /* src\LineChart.svelte generated by Svelte v3.16.0 */

    const { Map: Map_1, Object: Object_1$1, console: console_1 } = globals;
    const file$5 = "src\\LineChart.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[23] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[23] = list[i];
    	return child_ctx;
    }

    function get_each_context_2$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[31] = list[i];
    	return child_ctx;
    }

    function get_each_context_4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[31] = list[i];
    	return child_ctx;
    }

    // (297:2) {:else}
    function create_else_block_1(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Select model options and click \"Show\".";
    			attr_dev(div, "class", "notification");
    			add_location(div, file$5, 297, 4, 9235);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(297:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (160:2) {#if data.length > 0}
    function create_if_block(ctx) {
    	let h1;
    	let t0;

    	let t1_value = (/*calculation*/ ctx[1] == "percentage"
    	? "Percent Surplus or Shortage"
    	: /*calculation*/ ctx[1].slice(0, 1).toUpperCase() + /*calculation*/ ctx[1].slice(1)) + "";

    	let t1;
    	let t2;
    	let h2;
    	let t3;
    	let t4_value = /*xExtent*/ ctx[8][0] + "";
    	let t4;
    	let t5;
    	let t6_value = /*xExtent*/ ctx[8][1] + "";
    	let t6;
    	let t7;
    	let svg;
    	let g2;
    	let g0;
    	let each_blocks_2 = [];
    	let each0_lookup = new Map_1();
    	let g0_transform_value;
    	let g1;
    	let each_blocks_1 = [];
    	let each1_lookup = new Map_1();
    	let g1_transform_value;
    	let each_blocks = [];
    	let each2_lookup = new Map_1();
    	let text0;
    	let t8;
    	let text0_transform_value;
    	let text1;
    	let t9;
    	let text1_transform_value;
    	let rect;
    	let svg_viewBox_value;
    	let t10;
    	let if_block1_anchor;
    	let current;
    	let dispose;
    	let each_value_4 = /*xTicks*/ ctx[10];
    	const get_key = ctx => /*tick*/ ctx[31];

    	for (let i = 0; i < each_value_4.length; i += 1) {
    		let child_ctx = get_each_context_4(ctx, each_value_4, i);
    		let key = get_key(child_ctx);
    		each0_lookup.set(key, each_blocks_2[i] = create_each_block_4(key, child_ctx));
    	}

    	let each_value_3 = /*yTicks*/ ctx[11];
    	const get_key_1 = ctx => /*tick*/ ctx[31];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		let child_ctx = get_each_context_3(ctx, each_value_3, i);
    		let key = get_key_1(child_ctx);
    		each1_lookup.set(key, each_blocks_1[i] = create_each_block_3(key, child_ctx));
    	}

    	let each_value_2 = /*data*/ ctx[0];
    	const get_key_2 = ctx => /*lineElement*/ ctx[28].id;

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		let child_ctx = get_each_context_2$1(ctx, each_value_2, i);
    		let key = get_key_2(child_ctx);
    		each2_lookup.set(key, each_blocks[i] = create_each_block_2$1(key, child_ctx));
    	}

    	let if_block0 = /*hoverData*/ ctx[2] && /*data*/ ctx[0].length > 0 && create_if_block_3(ctx);
    	let if_block1 = /*hoverData*/ ctx[2] && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t0 = text("Projection of Nurse Workforce, ");
    			t1 = text(t1_value);
    			t2 = space();
    			h2 = element("h2");
    			t3 = text("North Carolina, ");
    			t4 = text(t4_value);
    			t5 = text(" - ");
    			t6 = text(t6_value);
    			t7 = space();
    			svg = svg_element("svg");
    			g2 = svg_element("g");
    			g0 = svg_element("g");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			g1 = svg_element("g");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			text0 = svg_element("text");
    			t8 = text("Nurse FTE or Head Count\r\n        ");
    			text1 = svg_element("text");
    			t9 = text("Year\r\n        ");
    			if (if_block0) if_block0.c();
    			rect = svg_element("rect");
    			t10 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr_dev(h1, "class", "title");
    			add_location(h1, file$5, 160, 4, 4481);
    			attr_dev(h2, "class", "subtitle");
    			add_location(h2, file$5, 165, 4, 4697);
    			attr_dev(g0, "class", "xAxis is-size-6 svelte-2pltqo");
    			attr_dev(g0, "transform", g0_transform_value = "translate(0," + (height - /*margin*/ ctx[13].bottom) + ")");
    			add_location(g0, file$5, 179, 8, 5282);
    			attr_dev(g1, "class", "yAxis is-size-6 svelte-2pltqo");
    			attr_dev(g1, "transform", g1_transform_value = "translate(" + /*margin*/ ctx[13].left + ",0)");
    			add_location(g1, file$5, 191, 8, 5623);
    			attr_dev(text0, "class", "is-size-5 svelte-2pltqo");
    			attr_dev(text0, "transform", text0_transform_value = "translate(" + (/*margin*/ ctx[13].left - 70) + "," + height / 1.5 + ") rotate(270)");
    			add_location(text0, file$5, 210, 8, 6289);
    			attr_dev(text1, "class", "is-size-5 svelte-2pltqo");
    			attr_dev(text1, "text-anchor", "middle");
    			attr_dev(text1, "transform", text1_transform_value = "translate(" + ((width - /*margin*/ ctx[13].left - /*margin*/ ctx[13].right) / 2 + /*margin*/ ctx[13].left) + "," + (height - 10) + ")");
    			add_location(text1, file$5, 216, 8, 6476);
    			attr_dev(rect, "width", width);
    			attr_dev(rect, "height", height);
    			attr_dev(rect, "fill", "none");
    			set_style(rect, "pointer-events", "all");
    			add_location(rect, file$5, 239, 8, 7230);
    			attr_dev(g2, "class", "chart-container");
    			add_location(g2, file$5, 167, 6, 4836);
    			attr_dev(svg, "id", "line-chart-svg");
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + width + " " + height);
    			add_location(svg, file$5, 166, 4, 4772);

    			dispose = [
    				listen_dev(rect, "mousemove", /*handleHover*/ ctx[15], false, false, false),
    				listen_dev(rect, "mouseleave", /*handleMouseLeave*/ ctx[16], false, false, false)
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t0);
    			append_dev(h1, t1);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, h2, anchor);
    			append_dev(h2, t3);
    			append_dev(h2, t4);
    			append_dev(h2, t5);
    			append_dev(h2, t6);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, svg, anchor);
    			append_dev(svg, g2);
    			append_dev(g2, g0);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(g0, null);
    			}

    			append_dev(g2, g1);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(g1, null);
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g2, null);
    			}

    			append_dev(g2, text0);
    			append_dev(text0, t8);
    			append_dev(g2, text1);
    			append_dev(text1, t9);
    			if (if_block0) if_block0.m(g2, null);
    			append_dev(g2, rect);
    			insert_dev(target, t10, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty[0] & /*calculation*/ 2) && t1_value !== (t1_value = (/*calculation*/ ctx[1] == "percentage"
    			? "Percent Surplus or Shortage"
    			: /*calculation*/ ctx[1].slice(0, 1).toUpperCase() + /*calculation*/ ctx[1].slice(1)) + "")) set_data_dev(t1, t1_value);

    			if ((!current || dirty[0] & /*xExtent*/ 256) && t4_value !== (t4_value = /*xExtent*/ ctx[8][0] + "")) set_data_dev(t4, t4_value);
    			if ((!current || dirty[0] & /*xExtent*/ 256) && t6_value !== (t6_value = /*xExtent*/ ctx[8][1] + "")) set_data_dev(t6, t6_value);
    			const each_value_4 = /*xTicks*/ ctx[10];
    			group_outros();
    			each_blocks_2 = update_keyed_each(each_blocks_2, dirty, get_key, 1, ctx, each_value_4, each0_lookup, g0, outro_and_destroy_block, create_each_block_4, null, get_each_context_4);
    			check_outros();
    			const each_value_3 = /*yTicks*/ ctx[11];
    			group_outros();
    			each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key_1, 1, ctx, each_value_3, each1_lookup, g1, outro_and_destroy_block, create_each_block_3, null, get_each_context_3);
    			check_outros();
    			const each_value_2 = /*data*/ ctx[0];
    			group_outros();
    			each_blocks = update_keyed_each(each_blocks, dirty, get_key_2, 1, ctx, each_value_2, each2_lookup, g2, outro_and_destroy_block, create_each_block_2$1, text0, get_each_context_2$1);
    			check_outros();

    			if (/*hoverData*/ ctx[2] && /*data*/ ctx[0].length > 0) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(g2, rect);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*hoverData*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_4.length; i += 1) {
    				transition_in(each_blocks_2[i]);
    			}

    			for (let i = 0; i < each_value_3.length; i += 1) {
    				transition_in(each_blocks_1[i]);
    			}

    			for (let i = 0; i < each_value_2.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				transition_out(each_blocks_2[i]);
    			}

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				transition_out(each_blocks_1[i]);
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(svg);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].d();
    			}

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].d();
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (if_block0) if_block0.d();
    			if (detaching) detach_dev(t10);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(160:2) {#if data.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (184:10) {#each xTicks as tick (tick)}
    function create_each_block_4(key_1, ctx) {
    	let first;
    	let current;

    	const xtick = new XTick({
    			props: {
    				position: [/*x*/ ctx[5](/*tick*/ ctx[31]), 0],
    				value: /*tick*/ ctx[31],
    				duration: transitionDuration
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(xtick.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(xtick, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const xtick_changes = {};
    			if (dirty[0] & /*x, xTicks*/ 1056) xtick_changes.position = [/*x*/ ctx[5](/*tick*/ ctx[31]), 0];
    			if (dirty[0] & /*xTicks*/ 1024) xtick_changes.value = /*tick*/ ctx[31];
    			xtick.$set(xtick_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(xtick.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(xtick.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(xtick, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_4.name,
    		type: "each",
    		source: "(184:10) {#each xTicks as tick (tick)}",
    		ctx
    	});

    	return block;
    }

    // (193:10) {#each yTicks as tick (tick)}
    function create_each_block_3(key_1, ctx) {
    	let first;
    	let current;

    	const ytick = new YTick({
    			props: {
    				y: /*y*/ ctx[6],
    				value: /*tick*/ ctx[31],
    				duration: transitionDuration,
    				chartWidth: width - /*margin*/ ctx[13].right - /*margin*/ ctx[13].left,
    				format: /*yFormat*/ ctx[12]
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(ytick.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(ytick, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const ytick_changes = {};
    			if (dirty[0] & /*y*/ 64) ytick_changes.y = /*y*/ ctx[6];
    			if (dirty[0] & /*yTicks*/ 2048) ytick_changes.value = /*tick*/ ctx[31];
    			if (dirty[0] & /*yFormat*/ 4096) ytick_changes.format = /*yFormat*/ ctx[12];
    			ytick.$set(ytick_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(ytick.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(ytick.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(ytick, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3.name,
    		type: "each",
    		source: "(193:10) {#each yTicks as tick (tick)}",
    		ctx
    	});

    	return block;
    }

    // (203:8) {#each data as lineElement (lineElement.id)}
    function create_each_block_2$1(key_1, ctx) {
    	let first;
    	let current;

    	const line_1 = new Line({
    			props: {
    				areaPath: /*area*/ ctx[7](/*lineElement*/ ctx[28].values),
    				linePath: /*line*/ ctx[4](/*lineElement*/ ctx[28].values),
    				color: /*colorMap*/ ctx[14].get(/*lineElement*/ ctx[28].id),
    				duration: transitionDuration
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(line_1.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(line_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const line_1_changes = {};
    			if (dirty[0] & /*area, data*/ 129) line_1_changes.areaPath = /*area*/ ctx[7](/*lineElement*/ ctx[28].values);
    			if (dirty[0] & /*line, data*/ 17) line_1_changes.linePath = /*line*/ ctx[4](/*lineElement*/ ctx[28].values);
    			if (dirty[0] & /*data*/ 1) line_1_changes.color = /*colorMap*/ ctx[14].get(/*lineElement*/ ctx[28].id);
    			line_1.$set(line_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(line_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(line_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(line_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2$1.name,
    		type: "each",
    		source: "(203:8) {#each data as lineElement (lineElement.id)}",
    		ctx
    	});

    	return block;
    }

    // (225:8) {#if hoverData && data.length > 0}
    function create_if_block_3(ctx) {
    	let line_1;
    	let line_1_x__value;
    	let line_1_x__value_1;
    	let line_1_y__value;
    	let line_1_y__value_1;
    	let each_1_anchor;
    	let each_value_1 = /*hoverData*/ ctx[2].values;
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			line_1 = svg_element("line");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			attr_dev(line_1, "x1", line_1_x__value = /*x*/ ctx[5](/*hoverData*/ ctx[2].year));
    			attr_dev(line_1, "x2", line_1_x__value_1 = /*x*/ ctx[5](/*hoverData*/ ctx[2].year));
    			attr_dev(line_1, "y1", line_1_y__value = /*margin*/ ctx[13].top);
    			attr_dev(line_1, "y2", line_1_y__value_1 = height - /*margin*/ ctx[13].bottom);
    			attr_dev(line_1, "stroke", "#333");
    			attr_dev(line_1, "stroke-width", "2");
    			add_location(line_1, file$5, 225, 10, 6760);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, line_1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*x, hoverData*/ 36 && line_1_x__value !== (line_1_x__value = /*x*/ ctx[5](/*hoverData*/ ctx[2].year))) {
    				attr_dev(line_1, "x1", line_1_x__value);
    			}

    			if (dirty[0] & /*x, hoverData*/ 36 && line_1_x__value_1 !== (line_1_x__value_1 = /*x*/ ctx[5](/*hoverData*/ ctx[2].year))) {
    				attr_dev(line_1, "x2", line_1_x__value_1);
    			}

    			if (dirty[0] & /*x, hoverData, y*/ 100) {
    				each_value_1 = /*hoverData*/ ctx[2].values;
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(line_1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(225:8) {#if hoverData && data.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (234:10) {#each hoverData.values as row}
    function create_each_block_1$1(ctx) {
    	let g;
    	let circle;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			circle = svg_element("circle");
    			attr_dev(circle, "cx", "0");
    			attr_dev(circle, "cy", "0");
    			attr_dev(circle, "r", "5");
    			attr_dev(circle, "stroke", "#333");
    			attr_dev(circle, "fill", "none");
    			add_location(circle, file$5, 235, 14, 7112);
    			attr_dev(g, "transform", g_transform_value = "translate(" + /*x*/ ctx[5](/*hoverData*/ ctx[2].year) + " " + /*y*/ ctx[6](/*row*/ ctx[23].value) + ")");
    			add_location(g, file$5, 234, 12, 7035);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, circle);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*x, hoverData, y*/ 100 && g_transform_value !== (g_transform_value = "translate(" + /*x*/ ctx[5](/*hoverData*/ ctx[2].year) + " " + /*y*/ ctx[6](/*row*/ ctx[23].value) + ")")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$1.name,
    		type: "each",
    		source: "(234:10) {#each hoverData.values as row}",
    		ctx
    	});

    	return block;
    }

    // (250:4) {#if hoverData}
    function create_if_block_1(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_2, create_else_block];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*calculation*/ ctx[1] === "percentage") return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(250:4) {#if hoverData}",
    		ctx
    	});

    	return block;
    }

    // (268:6) {:else}
    function create_else_block(ctx) {
    	let div1;
    	let div0;
    	let table;
    	let thead;
    	let tr;
    	let th;
    	let t0_value = /*hoverData*/ ctx[2].year + "";
    	let t0;
    	let t1;
    	let tbody;
    	let each_value = /*hoverData*/ ctx[2].values;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th = element("th");
    			t0 = text(t0_value);
    			t1 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(th, file$5, 279, 18, 8721);
    			add_location(tr, file$5, 278, 16, 8697);
    			add_location(thead, file$5, 277, 14, 8672);
    			add_location(tbody, file$5, 282, 14, 8809);
    			attr_dev(table, "class", "table is-narrow");
    			add_location(table, file$5, 276, 12, 8625);
    			attr_dev(div0, "class", "table-container");
    			add_location(div0, file$5, 275, 10, 8582);
    			set_style(div1, "position", "fixed");
    			set_style(div1, "top", /*lineChartPosition*/ ctx[3].clientY + "px");
    			set_style(div1, "left", /*lineChartPosition*/ ctx[3].left + /*lineChartPosition*/ ctx[3].scaling * (/*x*/ ctx[5](/*hoverData*/ ctx[2].year) + 8) + "px");
    			set_style(div1, "background", "rgba(255, 255, 255, 0.9)");
    			set_style(div1, "border-radius", "5px");
    			set_style(div1, "border", "1px\r\n        solid #333333");
    			set_style(div1, "padding", "3px\r\n        3px");
    			set_style(div1, "z-index", "200");
    			set_style(div1, "font-weight", "600");
    			set_style(div1, "pointer-events", "none");
    			add_location(div1, file$5, 268, 8, 8211);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th);
    			append_dev(th, t0);
    			append_dev(table, t1);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*hoverData*/ 4 && t0_value !== (t0_value = /*hoverData*/ ctx[2].year + "")) set_data_dev(t0, t0_value);

    			if (dirty[0] & /*colorMap, hoverData*/ 16388) {
    				each_value = /*hoverData*/ ctx[2].values;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty[0] & /*lineChartPosition*/ 8) {
    				set_style(div1, "top", /*lineChartPosition*/ ctx[3].clientY + "px");
    			}

    			if (dirty[0] & /*lineChartPosition, x, hoverData*/ 44) {
    				set_style(div1, "left", /*lineChartPosition*/ ctx[3].left + /*lineChartPosition*/ ctx[3].scaling * (/*x*/ ctx[5](/*hoverData*/ ctx[2].year) + 8) + "px");
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(268:6) {:else}",
    		ctx
    	});

    	return block;
    }

    // (251:6) {#if calculation === "percentage"}
    function create_if_block_2(ctx) {
    	let div;
    	let current;

    	const differencetooltiptable = new DifferenceToolTipTable({
    			props: { rows: /*hoverData*/ ctx[2].values },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(differencetooltiptable.$$.fragment);
    			attr_dev(div, "class", "tooltip");
    			set_style(div, "position", "fixed");
    			set_style(div, "top", /*lineChartPosition*/ ctx[3].clientY + "px");

    			set_style(div, "left", (/*hoverData*/ ctx[2].year < /*xHalfway*/ ctx[9]
    			? /*lineChartPosition*/ ctx[3].left + /*lineChartPosition*/ ctx[3].scaling * /*x*/ ctx[5](/*hoverData*/ ctx[2].year) + 8
    			: /*lineChartPosition*/ ctx[3].left + /*lineChartPosition*/ ctx[3].scaling * /*x*/ ctx[5](/*hoverData*/ ctx[2].year) - 318) + "px");

    			set_style(div, "background", "rgba(255, 255, 255, 0.9)");
    			set_style(div, "border-radius", "5px");
    			set_style(div, "border", "1px\r\n      solid #333333");
    			set_style(div, "padding", "3px\r\n      3px");
    			set_style(div, "z-index", "200");
    			set_style(div, "font-weight", "600");
    			set_style(div, "width", "310px");
    			set_style(div, "pointer-events", "none");
    			add_location(div, file$5, 251, 8, 7527);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(differencetooltiptable, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const differencetooltiptable_changes = {};
    			if (dirty[0] & /*hoverData*/ 4) differencetooltiptable_changes.rows = /*hoverData*/ ctx[2].values;
    			differencetooltiptable.$set(differencetooltiptable_changes);

    			if (!current || dirty[0] & /*lineChartPosition*/ 8) {
    				set_style(div, "top", /*lineChartPosition*/ ctx[3].clientY + "px");
    			}

    			if (!current || dirty[0] & /*hoverData, xHalfway, lineChartPosition, x*/ 556) {
    				set_style(div, "left", (/*hoverData*/ ctx[2].year < /*xHalfway*/ ctx[9]
    				? /*lineChartPosition*/ ctx[3].left + /*lineChartPosition*/ ctx[3].scaling * /*x*/ ctx[5](/*hoverData*/ ctx[2].year) + 8
    				: /*lineChartPosition*/ ctx[3].left + /*lineChartPosition*/ ctx[3].scaling * /*x*/ ctx[5](/*hoverData*/ ctx[2].year) - 318) + "px");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(differencetooltiptable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(differencetooltiptable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(differencetooltiptable);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(251:6) {#if calculation === \\\"percentage\\\"}",
    		ctx
    	});

    	return block;
    }

    // (284:16) {#each hoverData.values as row}
    function create_each_block$2(ctx) {
    	let tr;
    	let td;
    	let t0_value = numberFormat(/*row*/ ctx[23].rateOrTotal)(/*row*/ ctx[23].value) + "";
    	let t0;
    	let t1;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			set_style(td, "color", /*colorMap*/ ctx[14].get(/*row*/ ctx[23].id));
    			set_style(td, "text-align", "right");
    			add_location(td, file$5, 285, 20, 8911);
    			add_location(tr, file$5, 284, 18, 8885);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td);
    			append_dev(td, t0);
    			append_dev(tr, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*hoverData*/ 4 && t0_value !== (t0_value = numberFormat(/*row*/ ctx[23].rateOrTotal)(/*row*/ ctx[23].value) + "")) set_data_dev(t0, t0_value);

    			if (dirty[0] & /*hoverData*/ 4) {
    				set_style(td, "color", /*colorMap*/ ctx[14].get(/*row*/ ctx[23].id));
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(284:16) {#each hoverData.values as row}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let t;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*data*/ ctx[0].length > 0) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const linechartlegendtable = new LineChartLegendTable({
    			props: {
    				legendData: /*data*/ ctx[0].map(/*func*/ ctx[21])
    			},
    			$$inline: true
    		});

    	linechartlegendtable.$on("deleteProjection", /*deleteProjection_handler*/ ctx[22]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			t = space();
    			create_component(linechartlegendtable.$$.fragment);
    			attr_dev(div, "id", "line-chart-div");
    			add_location(div, file$5, 158, 0, 4425);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			append_dev(div, t);
    			mount_component(linechartlegendtable, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, t);
    			}

    			const linechartlegendtable_changes = {};
    			if (dirty[0] & /*data*/ 1) linechartlegendtable_changes.legendData = /*data*/ ctx[0].map(/*func*/ ctx[21]);
    			linechartlegendtable.$set(linechartlegendtable_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(linechartlegendtable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(linechartlegendtable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    			destroy_component(linechartlegendtable);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const width = 800;
    const height = 475;
    const transitionDuration = 400;

    function getContainerCoords(node, event) {
    	var svg = node.ownerSVGElement || node;

    	if (svg.createSVGPoint) {
    		var point = svg.createSVGPoint();
    		(point.x = event.clientX, point.y = event.clientY);
    		point = point.matrixTransform(node.getScreenCTM().inverse());
    		return [point.x, point.y];
    	}

    	var rect = node.getBoundingClientRect();

    	return [
    		event.clientX - rect.left - node.clientLeft,
    		event.clientY - rect.top - node.clientTop
    	];
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	let { calculation } = $$props;
    	const margin = { top: 20, right: 60, bottom: 65, left: 90 };

    	const colors = [
    		"#1f77b4",
    		"#ff7f0e",
    		"#2ca02c",
    		"#d62728",
    		"#9467bd",
    		"#8c564b",
    		"#e377c2",
    		"#7f7f7f",
    		"#bcbd22",
    		"#17becf"
    	];

    	let colorMap = new Map();
    	let hoverData;
    	let lineChartPosition = [];

    	function handleHover(e) {
    		const { clientY } = e;
    		let hoverYear = Math.round(x.invert(getContainerCoords(this, e)[0]));
    		const boundingRect = e.target.getBoundingClientRect();
    		const scaling = boundingRect.width / width;

    		$$invalidate(3, lineChartPosition = {
    			left: boundingRect.left,
    			top: boundingRect.top,
    			scaling,
    			clientY
    		});

    		if (hoverYear < xExtent[0]) {
    			hoverYear = xExtent[0];
    		} else if (hoverYear > xExtent[1]) {
    			hoverYear = xExtent[1];
    		}

    		$$invalidate(2, hoverData = {
    			year: hoverYear,
    			values: byYearData.get(hoverYear).sort(function (a, b) {
    				return descending(a.value, b.value);
    			})
    		});
    	}

    	function handleMouseLeave() {
    		$$invalidate(2, hoverData = undefined);
    	}

    	const writable_props = ["data", "calculation"];

    	Object_1$1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<LineChart> was created with unknown prop '${key}'`);
    	});

    	const func = (d, i) => ({
    		params: d.params,
    		color: colorMap.get(d.id),
    		id: d.id
    	});

    	function deleteProjection_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("calculation" in $$props) $$invalidate(1, calculation = $$props.calculation);
    	};

    	$$self.$capture_state = () => {
    		return {
    			data,
    			calculation,
    			colorMap,
    			hoverData,
    			lineChartPosition,
    			line,
    			x,
    			y,
    			area,
    			flatData,
    			byYearData,
    			xExtent,
    			xHalfway,
    			yExtent,
    			xTicks,
    			yTicks,
    			yFormat
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("calculation" in $$props) $$invalidate(1, calculation = $$props.calculation);
    		if ("colorMap" in $$props) $$invalidate(14, colorMap = $$props.colorMap);
    		if ("hoverData" in $$props) $$invalidate(2, hoverData = $$props.hoverData);
    		if ("lineChartPosition" in $$props) $$invalidate(3, lineChartPosition = $$props.lineChartPosition);
    		if ("line" in $$props) $$invalidate(4, line = $$props.line);
    		if ("x" in $$props) $$invalidate(5, x = $$props.x);
    		if ("y" in $$props) $$invalidate(6, y = $$props.y);
    		if ("area" in $$props) $$invalidate(7, area = $$props.area);
    		if ("flatData" in $$props) $$invalidate(17, flatData = $$props.flatData);
    		if ("byYearData" in $$props) byYearData = $$props.byYearData;
    		if ("xExtent" in $$props) $$invalidate(8, xExtent = $$props.xExtent);
    		if ("xHalfway" in $$props) $$invalidate(9, xHalfway = $$props.xHalfway);
    		if ("yExtent" in $$props) $$invalidate(19, yExtent = $$props.yExtent);
    		if ("xTicks" in $$props) $$invalidate(10, xTicks = $$props.xTicks);
    		if ("yTicks" in $$props) $$invalidate(11, yTicks = $$props.yTicks);
    		if ("yFormat" in $$props) $$invalidate(12, yFormat = $$props.yFormat);
    	};

    	let line;
    	let area;
    	let flatData;
    	let byYearData;
    	let xExtent;
    	let xHalfway;
    	let yExtent;
    	let x;
    	let xTicks;
    	let y;
    	let yTicks;
    	let yFormat;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 {
    				colorMap.forEach(function (value, key) {
    					if (!data.map(d => d.id).includes(+key)) {
    						colorMap.delete(key);
    					}
    				});

    				data.forEach(function (d) {
    					if (!colorMap.has(d.id)) {
    						const availableColors = colors.filter(d => !Array.from(colorMap.values()).includes(d));
    						colorMap.set(d.id, availableColors[0]);
    					}
    				});
    			}
    		}

    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 $$invalidate(17, flatData = data.map(d => d.values.map(e => Object.assign(
    				{
    					id: d.id,
    					rateOrTotal: d.params.find(d => d[0] == "rateOrTotal")[1],
    					color: colorMap.get(d.id)
    				},
    				e
    			))).flat());
    		}

    		if ($$self.$$.dirty[0] & /*flatData*/ 131072) {
    			 $$invalidate(8, xExtent = flatData.length > 0
    			? extent(flatData, d => d.year)
    			: [2015, 2032]);
    		}

    		if ($$self.$$.dirty[0] & /*xExtent*/ 256) {
    			 $$invalidate(5, x = linear$1().domain(xExtent).range([margin.left, width - margin.right]));
    		}

    		if ($$self.$$.dirty[0] & /*flatData*/ 131072) {
    			 $$invalidate(19, yExtent = flatData.length > 0
    			? extent(flatData, d => d.value)
    			: [0, 50]);
    		}

    		if ($$self.$$.dirty[0] & /*yExtent*/ 524288) {
    			 $$invalidate(6, y = linear$1().domain([yExtent[0] >= 0 ? 0 : yExtent[0], yExtent[1]]).nice().range([height - margin.bottom, margin.top]));
    		}

    		if ($$self.$$.dirty[0] & /*x, y*/ 96) {
    			 $$invalidate(4, line = d3line().curve(monotoneX).defined(d => !isNaN(d.value)).x(d => x(d.year)).y(d => y(d.value)));
    		}

    		if ($$self.$$.dirty[0] & /*x, y*/ 96) {
    			 $$invalidate(7, area = d3area().x(d => x(d.year)).y0(d => y(d.uci)).y1(d => y(d.lci)).curve(monotoneX));
    		}

    		if ($$self.$$.dirty[0] & /*flatData*/ 131072) {
    			 console.log(flatData);
    		}

    		if ($$self.$$.dirty[0] & /*flatData*/ 131072) {
    			 byYearData = group(flatData, d => d.year);
    		}

    		if ($$self.$$.dirty[0] & /*xExtent*/ 256) {
    			 $$invalidate(9, xHalfway = Math.round((xExtent[1] - xExtent[0]) / 2 + xExtent[0]));
    		}

    		if ($$self.$$.dirty[0] & /*x*/ 32) {
    			 $$invalidate(10, xTicks = x.ticks());
    		}

    		if ($$self.$$.dirty[0] & /*y*/ 64) {
    			 $$invalidate(11, yTicks = y.ticks());
    		}

    		if ($$self.$$.dirty[0] & /*calculation*/ 2) {
    			 $$invalidate(12, yFormat = val => calculation === "percentage"
    			? val.toLocaleString(undefined, {
    					style: "percent",
    					signDisplay: "exceptZero"
    				})
    			: val.toLocaleString());
    		}
    	};

    	return [
    		data,
    		calculation,
    		hoverData,
    		lineChartPosition,
    		line,
    		x,
    		y,
    		area,
    		xExtent,
    		xHalfway,
    		xTicks,
    		yTicks,
    		yFormat,
    		margin,
    		colorMap,
    		handleHover,
    		handleMouseLeave,
    		flatData,
    		byYearData,
    		yExtent,
    		colors,
    		func,
    		deleteProjection_handler
    	];
    }

    class LineChart extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { data: 0, calculation: 1 }, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "LineChart",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*data*/ ctx[0] === undefined && !("data" in props)) {
    			console_1.warn("<LineChart> was created without expected prop 'data'");
    		}

    		if (/*calculation*/ ctx[1] === undefined && !("calculation" in props)) {
    			console_1.warn("<LineChart> was created without expected prop 'calculation'");
    		}
    	}

    	get data() {
    		throw new Error("<LineChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<LineChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get calculation() {
    		throw new Error("<LineChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set calculation(value) {
    		throw new Error("<LineChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\LineLegend.svelte generated by Svelte v3.16.0 */

    const file$6 = "src\\LineLegend.svelte";

    function create_fragment$6(ctx) {
    	let g2;
    	let g0;
    	let text0;
    	let t0;
    	let line0;
    	let g1;
    	let text1;
    	let t1;
    	let line1;

    	const block = {
    		c: function create() {
    			g2 = svg_element("g");
    			g0 = svg_element("g");
    			text0 = svg_element("text");
    			t0 = text("Supply");
    			line0 = svg_element("line");
    			g1 = svg_element("g");
    			text1 = svg_element("text");
    			t1 = text("Demand");
    			line1 = svg_element("line");
    			attr_dev(text0, "class", "is-size-5 svelte-i991i1");
    			add_location(text0, file$6, 15, 4, 227);
    			attr_dev(line0, "x1", "-75");
    			attr_dev(line0, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(line0, "x2", "-5");
    			attr_dev(line0, "y1", "-7");
    			attr_dev(line0, "y2", "-7");
    			attr_dev(line0, "stroke", "black");
    			add_location(line0, file$6, 16, 4, 270);
    			add_location(g0, file$6, 14, 2, 218);
    			attr_dev(text1, "class", "is-size-5 svelte-i991i1");
    			add_location(text1, file$6, 25, 4, 443);
    			attr_dev(line1, "x1", "-75");
    			attr_dev(line1, "stroke-dasharray", /*dashArray*/ ctx[0]);
    			attr_dev(line1, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(line1, "x2", "-5");
    			attr_dev(line1, "y1", "-7");
    			attr_dev(line1, "y2", "-7");
    			attr_dev(line1, "stroke", "black");
    			add_location(line1, file$6, 26, 4, 486);
    			attr_dev(g1, "transform", "translate(150)");
    			add_location(g1, file$6, 24, 2, 407);
    			attr_dev(g2, "transform", /*transform*/ ctx[2]);
    			add_location(g2, file$6, 13, 0, 199);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g2, anchor);
    			append_dev(g2, g0);
    			append_dev(g0, text0);
    			append_dev(text0, t0);
    			append_dev(g0, line0);
    			append_dev(g2, g1);
    			append_dev(g1, text1);
    			append_dev(text1, t1);
    			append_dev(g1, line1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(line0, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*dashArray*/ 1) {
    				attr_dev(line1, "stroke-dasharray", /*dashArray*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(line1, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*transform*/ 4) {
    				attr_dev(g2, "transform", /*transform*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { dashArray = "" } = $$props;
    	let { strokeWidth } = $$props;
    	let { transform } = $$props;
    	const writable_props = ["dashArray", "strokeWidth", "transform"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<LineLegend> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("dashArray" in $$props) $$invalidate(0, dashArray = $$props.dashArray);
    		if ("strokeWidth" in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ("transform" in $$props) $$invalidate(2, transform = $$props.transform);
    	};

    	$$self.$capture_state = () => {
    		return { dashArray, strokeWidth, transform };
    	};

    	$$self.$inject_state = $$props => {
    		if ("dashArray" in $$props) $$invalidate(0, dashArray = $$props.dashArray);
    		if ("strokeWidth" in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ("transform" in $$props) $$invalidate(2, transform = $$props.transform);
    	};

    	return [dashArray, strokeWidth, transform];
    }

    class LineLegend extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			dashArray: 0,
    			strokeWidth: 1,
    			transform: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "LineLegend",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*strokeWidth*/ ctx[1] === undefined && !("strokeWidth" in props)) {
    			console.warn("<LineLegend> was created without expected prop 'strokeWidth'");
    		}

    		if (/*transform*/ ctx[2] === undefined && !("transform" in props)) {
    			console.warn("<LineLegend> was created without expected prop 'transform'");
    		}
    	}

    	get dashArray() {
    		throw new Error("<LineLegend>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dashArray(value) {
    		throw new Error("<LineLegend>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<LineLegend>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<LineLegend>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get transform() {
    		throw new Error("<LineLegend>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set transform(value) {
    		throw new Error("<LineLegend>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\LineChartDifference.svelte generated by Svelte v3.16.0 */

    const { Map: Map_1$1, Object: Object_1$2 } = globals;
    const file$7 = "src\\LineChartDifference.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[25] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    function get_each_context_2$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[31] = list[i];
    	return child_ctx;
    }

    function get_each_context_3$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[31] = list[i];
    	return child_ctx;
    }

    function get_each_context_4$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[36] = list[i];
    	return child_ctx;
    }

    function get_each_context_5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[39] = list[i];
    	return child_ctx;
    }

    // (421:2) {:else}
    function create_else_block$1(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Select model options and click \"Show\".";
    			attr_dev(div, "class", "notification");
    			add_location(div, file$7, 421, 4, 12625);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(421:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (191:2) {#if data.length > 0}
    function create_if_block$1(ctx) {
    	let h1;
    	let t1;
    	let h2;
    	let t2;
    	let t3_value = /*xExtent*/ ctx[10][0] + "";
    	let t3;
    	let t4;
    	let t5_value = /*xExtent*/ ctx[10][1] + "";
    	let t5;
    	let t6;
    	let svg;
    	let defs;
    	let each_blocks_4 = [];
    	let each0_lookup = new Map_1$1();
    	let each_blocks_3 = [];
    	let each1_lookup = new Map_1$1();
    	let g2;
    	let g0;
    	let each_blocks_2 = [];
    	let each2_lookup = new Map_1$1();
    	let g0_transform_value;
    	let g1;
    	let each_blocks_1 = [];
    	let each3_lookup = new Map_1$1();
    	let g1_transform_value;
    	let each_blocks = [];
    	let each4_lookup = new Map_1$1();
    	let text0;
    	let t7;
    	let text0_transform_value;
    	let text1;
    	let t8;
    	let text1_transform_value;
    	let rect;
    	let svg_viewBox_value;
    	let t9;
    	let if_block1_anchor;
    	let current;
    	let dispose;
    	let each_value_5 = /*data*/ ctx[0];
    	const get_key = ctx => /*gradient*/ ctx[39].id;

    	for (let i = 0; i < each_value_5.length; i += 1) {
    		let child_ctx = get_each_context_5(ctx, each_value_5, i);
    		let key = get_key(child_ctx);
    		each0_lookup.set(key, each_blocks_4[i] = create_each_block_5(key, child_ctx));
    	}

    	let each_value_4 = /*data*/ ctx[0];
    	const get_key_1 = ctx => /*clip*/ ctx[36].id;

    	for (let i = 0; i < each_value_4.length; i += 1) {
    		let child_ctx = get_each_context_4$1(ctx, each_value_4, i);
    		let key = get_key_1(child_ctx);
    		each1_lookup.set(key, each_blocks_3[i] = create_each_block_4$1(key, child_ctx));
    	}

    	const linelegend = new LineLegend({
    			props: {
    				dashArray,
    				strokeWidth,
    				transform: "translate(" + (width$1 - 285) + "," + (/*margin*/ ctx[14].top - 10) + ")"
    			},
    			$$inline: true
    		});

    	let each_value_3 = /*xTicks*/ ctx[12];
    	const get_key_2 = ctx => /*tick*/ ctx[31];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		let child_ctx = get_each_context_3$1(ctx, each_value_3, i);
    		let key = get_key_2(child_ctx);
    		each2_lookup.set(key, each_blocks_2[i] = create_each_block_3$1(key, child_ctx));
    	}

    	let each_value_2 = /*yTicks*/ ctx[13];
    	const get_key_3 = ctx => /*tick*/ ctx[31];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		let child_ctx = get_each_context_2$2(ctx, each_value_2, i);
    		let key = get_key_3(child_ctx);
    		each3_lookup.set(key, each_blocks_1[i] = create_each_block_2$2(key, child_ctx));
    	}

    	let each_value_1 = /*data*/ ctx[0];
    	const get_key_4 = ctx => /*lineElement*/ ctx[28].id;

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1$2(ctx, each_value_1, i);
    		let key = get_key_4(child_ctx);
    		each4_lookup.set(key, each_blocks[i] = create_each_block_1$2(key, child_ctx));
    	}

    	let if_block0 = /*hoverData*/ ctx[2] && /*data*/ ctx[0].length > 0 && create_if_block_2$1(ctx);
    	let if_block1 = /*hoverData*/ ctx[2] && create_if_block_1$1(ctx);

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Projection of Nurse Workforce, Supply - Demand";
    			t1 = space();
    			h2 = element("h2");
    			t2 = text("North Carolina, ");
    			t3 = text(t3_value);
    			t4 = text(" - ");
    			t5 = text(t5_value);
    			t6 = space();
    			svg = svg_element("svg");
    			defs = svg_element("defs");

    			for (let i = 0; i < each_blocks_4.length; i += 1) {
    				each_blocks_4[i].c();
    			}

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].c();
    			}

    			g2 = svg_element("g");
    			create_component(linelegend.$$.fragment);
    			g0 = svg_element("g");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			g1 = svg_element("g");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			text0 = svg_element("text");
    			t7 = text("Nurse FTE or Head Count\r\n        ");
    			text1 = svg_element("text");
    			t8 = text("Year\r\n        ");
    			if (if_block0) if_block0.c();
    			rect = svg_element("rect");
    			t9 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr_dev(h1, "class", "title");
    			add_location(h1, file$7, 191, 4, 5168);
    			attr_dev(h2, "class", "subtitle");
    			add_location(h2, file$7, 192, 4, 5243);
    			add_location(defs, file$7, 194, 6, 5382);
    			attr_dev(g0, "class", "xAxis is-size-6 svelte-2pltqo");
    			attr_dev(g0, "transform", g0_transform_value = "translate(0," + (height$1 - /*margin*/ ctx[14].bottom) + ")");
    			add_location(g0, file$7, 267, 8, 7540);
    			attr_dev(g1, "class", "yAxis is-size-6 svelte-2pltqo");
    			attr_dev(g1, "transform", g1_transform_value = "translate(" + /*margin*/ ctx[14].left + ",0)");
    			add_location(g1, file$7, 279, 8, 7881);
    			attr_dev(text0, "class", "is-size-5 svelte-2pltqo");
    			attr_dev(text0, "transform", text0_transform_value = "translate(" + (/*margin*/ ctx[14].left - 70) + "," + height$1 / 1.5 + ") rotate(270)");
    			add_location(text0, file$7, 359, 8, 10585);
    			attr_dev(text1, "class", "is-size-5 svelte-2pltqo");
    			attr_dev(text1, "text-anchor", "middle");
    			attr_dev(text1, "transform", text1_transform_value = "translate(" + ((width$1 - /*margin*/ ctx[14].left - /*margin*/ ctx[14].right) / 2 + /*margin*/ ctx[14].left) + "," + (height$1 - 10) + ")");
    			add_location(text1, file$7, 365, 8, 10772);
    			attr_dev(rect, "width", width$1);
    			attr_dev(rect, "height", height$1);
    			attr_dev(rect, "fill", "none");
    			set_style(rect, "pointer-events", "all");
    			add_location(rect, file$7, 392, 8, 11703);
    			attr_dev(g2, "class", "chart-container");
    			add_location(g2, file$7, 248, 6, 6927);
    			attr_dev(svg, "id", "line-chart-svg");
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + width$1 + " " + height$1);
    			add_location(svg, file$7, 193, 4, 5318);

    			dispose = [
    				listen_dev(rect, "mousemove", /*handleHover*/ ctx[16], false, false, false),
    				listen_dev(rect, "mouseleave", /*handleMouseLeave*/ ctx[17], false, false, false)
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, h2, anchor);
    			append_dev(h2, t2);
    			append_dev(h2, t3);
    			append_dev(h2, t4);
    			append_dev(h2, t5);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, svg, anchor);
    			append_dev(svg, defs);

    			for (let i = 0; i < each_blocks_4.length; i += 1) {
    				each_blocks_4[i].m(defs, null);
    			}

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].m(svg, null);
    			}

    			append_dev(svg, g2);
    			mount_component(linelegend, g2, null);
    			append_dev(g2, g0);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(g0, null);
    			}

    			append_dev(g2, g1);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(g1, null);
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g2, null);
    			}

    			append_dev(g2, text0);
    			append_dev(text0, t7);
    			append_dev(g2, text1);
    			append_dev(text1, t8);
    			if (if_block0) if_block0.m(g2, null);
    			append_dev(g2, rect);
    			insert_dev(target, t9, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty[0] & /*xExtent*/ 1024) && t3_value !== (t3_value = /*xExtent*/ ctx[10][0] + "")) set_data_dev(t3, t3_value);
    			if ((!current || dirty[0] & /*xExtent*/ 1024) && t5_value !== (t5_value = /*xExtent*/ ctx[10][1] + "")) set_data_dev(t5, t5_value);
    			const each_value_5 = /*data*/ ctx[0];
    			each_blocks_4 = update_keyed_each(each_blocks_4, dirty, get_key, 1, ctx, each_value_5, each0_lookup, defs, destroy_block, create_each_block_5, null, get_each_context_5);
    			const each_value_4 = /*data*/ ctx[0];
    			each_blocks_3 = update_keyed_each(each_blocks_3, dirty, get_key_1, 1, ctx, each_value_4, each1_lookup, svg, destroy_block, create_each_block_4$1, g2, get_each_context_4$1);
    			const each_value_3 = /*xTicks*/ ctx[12];
    			group_outros();
    			each_blocks_2 = update_keyed_each(each_blocks_2, dirty, get_key_2, 1, ctx, each_value_3, each2_lookup, g0, outro_and_destroy_block, create_each_block_3$1, null, get_each_context_3$1);
    			check_outros();
    			const each_value_2 = /*yTicks*/ ctx[13];
    			group_outros();
    			each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key_3, 1, ctx, each_value_2, each3_lookup, g1, outro_and_destroy_block, create_each_block_2$2, null, get_each_context_2$2);
    			check_outros();
    			const each_value_1 = /*data*/ ctx[0];
    			group_outros();
    			each_blocks = update_keyed_each(each_blocks, dirty, get_key_4, 1, ctx, each_value_1, each4_lookup, g2, outro_and_destroy_block, create_each_block_1$2, text0, get_each_context_1$2);
    			check_outros();

    			if (/*hoverData*/ ctx[2] && /*data*/ ctx[0].length > 0) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					if_block0.m(g2, rect);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*hoverData*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_1$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(linelegend.$$.fragment, local);

    			for (let i = 0; i < each_value_3.length; i += 1) {
    				transition_in(each_blocks_2[i]);
    			}

    			for (let i = 0; i < each_value_2.length; i += 1) {
    				transition_in(each_blocks_1[i]);
    			}

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(linelegend.$$.fragment, local);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				transition_out(each_blocks_2[i]);
    			}

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				transition_out(each_blocks_1[i]);
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(svg);

    			for (let i = 0; i < each_blocks_4.length; i += 1) {
    				each_blocks_4[i].d();
    			}

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].d();
    			}

    			destroy_component(linelegend);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].d();
    			}

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].d();
    			}

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (if_block0) if_block0.d();
    			if (detaching) detach_dev(t9);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(191:2) {#if data.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (196:8) {#each data as gradient (gradient.id)}
    function create_each_block_5(key_1, ctx) {
    	let linearGradient0;
    	let stop0;
    	let stop0_stop_color_value;
    	let stop1;
    	let linearGradient0_id_value;
    	let linearGradient1;
    	let stop2;
    	let stop2_stop_color_value;
    	let stop3;
    	let linearGradient1_id_value;

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			linearGradient0 = svg_element("linearGradient");
    			stop0 = svg_element("stop");
    			stop1 = svg_element("stop");
    			linearGradient1 = svg_element("linearGradient");
    			stop2 = svg_element("stop");
    			stop3 = svg_element("stop");
    			attr_dev(stop0, "offset", "0%");
    			attr_dev(stop0, "stop-color", stop0_stop_color_value = /*colorMap*/ ctx[15].get(/*gradient*/ ctx[39].id));
    			attr_dev(stop0, "stop-opacity", "1");
    			add_location(stop0, file$7, 203, 12, 5624);
    			attr_dev(stop1, "offset", "100%");
    			attr_dev(stop1, "stop-color", "white");
    			attr_dev(stop1, "stop-opacity", "0");
    			add_location(stop1, file$7, 208, 12, 5772);
    			attr_dev(linearGradient0, "id", linearGradient0_id_value = "gradientBelow" + /*gradient*/ ctx[39].id);
    			attr_dev(linearGradient0, "x1", "0%");
    			attr_dev(linearGradient0, "y1", "0%");
    			attr_dev(linearGradient0, "x2", "0%");
    			attr_dev(linearGradient0, "y2", "100%");
    			add_location(linearGradient0, file$7, 196, 10, 5448);
    			attr_dev(stop2, "offset", "0%");
    			attr_dev(stop2, "stop-color", stop2_stop_color_value = /*colorMap*/ ctx[15].get(/*gradient*/ ctx[39].id));
    			attr_dev(stop2, "stop-opacity", "1");
    			add_location(stop2, file$7, 217, 12, 6047);
    			attr_dev(stop3, "offset", "100%");
    			attr_dev(stop3, "stop-color", "white");
    			attr_dev(stop3, "stop-opacity", "0");
    			add_location(stop3, file$7, 222, 12, 6195);
    			attr_dev(linearGradient1, "id", linearGradient1_id_value = "gradientAbove" + /*gradient*/ ctx[39].id);
    			attr_dev(linearGradient1, "x1", "0%");
    			attr_dev(linearGradient1, "y1", "100%");
    			attr_dev(linearGradient1, "x2", "0%");
    			attr_dev(linearGradient1, "y2", "0%");
    			add_location(linearGradient1, file$7, 210, 10, 5871);
    			this.first = linearGradient0;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, linearGradient0, anchor);
    			append_dev(linearGradient0, stop0);
    			append_dev(linearGradient0, stop1);
    			insert_dev(target, linearGradient1, anchor);
    			append_dev(linearGradient1, stop2);
    			append_dev(linearGradient1, stop3);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*data*/ 1 && stop0_stop_color_value !== (stop0_stop_color_value = /*colorMap*/ ctx[15].get(/*gradient*/ ctx[39].id))) {
    				attr_dev(stop0, "stop-color", stop0_stop_color_value);
    			}

    			if (dirty[0] & /*data*/ 1 && linearGradient0_id_value !== (linearGradient0_id_value = "gradientBelow" + /*gradient*/ ctx[39].id)) {
    				attr_dev(linearGradient0, "id", linearGradient0_id_value);
    			}

    			if (dirty[0] & /*data*/ 1 && stop2_stop_color_value !== (stop2_stop_color_value = /*colorMap*/ ctx[15].get(/*gradient*/ ctx[39].id))) {
    				attr_dev(stop2, "stop-color", stop2_stop_color_value);
    			}

    			if (dirty[0] & /*data*/ 1 && linearGradient1_id_value !== (linearGradient1_id_value = "gradientAbove" + /*gradient*/ ctx[39].id)) {
    				attr_dev(linearGradient1, "id", linearGradient1_id_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(linearGradient0);
    			if (detaching) detach_dev(linearGradient1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_5.name,
    		type: "each",
    		source: "(196:8) {#each data as gradient (gradient.id)}",
    		ctx
    	});

    	return block;
    }

    // (227:6) {#each data as clip (clip.id)}
    function create_each_block_4$1(key_1, ctx) {
    	let clipPath0;
    	let path0;
    	let path0_d_value;
    	let clipPath0_id_value;
    	let clipPath1;
    	let path1;
    	let path1_d_value;
    	let clipPath1_id_value;

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			clipPath0 = svg_element("clipPath");
    			path0 = svg_element("path");
    			clipPath1 = svg_element("clipPath");
    			path1 = svg_element("path");
    			attr_dev(path0, "d", path0_d_value = /*aboveClip*/ ctx[6](/*clip*/ ctx[36].values.map(func)));
    			add_location(path0, file$7, 228, 10, 6407);
    			attr_dev(clipPath0, "id", clipPath0_id_value = "above" + /*clip*/ ctx[36].id);
    			add_location(clipPath0, file$7, 227, 8, 6362);
    			attr_dev(path1, "d", path1_d_value = /*belowClip*/ ctx[7](/*clip*/ ctx[36].values.map(func_1)));
    			add_location(path1, file$7, 238, 10, 6683);
    			attr_dev(clipPath1, "id", clipPath1_id_value = "below" + /*clip*/ ctx[36].id);
    			add_location(clipPath1, file$7, 237, 8, 6638);
    			this.first = clipPath0;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, clipPath0, anchor);
    			append_dev(clipPath0, path0);
    			insert_dev(target, clipPath1, anchor);
    			append_dev(clipPath1, path1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*aboveClip, data*/ 65 && path0_d_value !== (path0_d_value = /*aboveClip*/ ctx[6](/*clip*/ ctx[36].values.map(func)))) {
    				attr_dev(path0, "d", path0_d_value);
    			}

    			if (dirty[0] & /*data*/ 1 && clipPath0_id_value !== (clipPath0_id_value = "above" + /*clip*/ ctx[36].id)) {
    				attr_dev(clipPath0, "id", clipPath0_id_value);
    			}

    			if (dirty[0] & /*belowClip, data*/ 129 && path1_d_value !== (path1_d_value = /*belowClip*/ ctx[7](/*clip*/ ctx[36].values.map(func_1)))) {
    				attr_dev(path1, "d", path1_d_value);
    			}

    			if (dirty[0] & /*data*/ 1 && clipPath1_id_value !== (clipPath1_id_value = "below" + /*clip*/ ctx[36].id)) {
    				attr_dev(clipPath1, "id", clipPath1_id_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(clipPath0);
    			if (detaching) detach_dev(clipPath1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_4$1.name,
    		type: "each",
    		source: "(227:6) {#each data as clip (clip.id)}",
    		ctx
    	});

    	return block;
    }

    // (272:10) {#each xTicks as tick (tick)}
    function create_each_block_3$1(key_1, ctx) {
    	let first;
    	let current;

    	const xtick = new XTick({
    			props: {
    				position: [/*x*/ ctx[4](/*tick*/ ctx[31]), 0],
    				value: /*tick*/ ctx[31],
    				duration: transitionDuration$1
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(xtick.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(xtick, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const xtick_changes = {};
    			if (dirty[0] & /*x, xTicks*/ 4112) xtick_changes.position = [/*x*/ ctx[4](/*tick*/ ctx[31]), 0];
    			if (dirty[0] & /*xTicks*/ 4096) xtick_changes.value = /*tick*/ ctx[31];
    			xtick.$set(xtick_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(xtick.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(xtick.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(xtick, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3$1.name,
    		type: "each",
    		source: "(272:10) {#each xTicks as tick (tick)}",
    		ctx
    	});

    	return block;
    }

    // (281:10) {#each yTicks as tick (tick)}
    function create_each_block_2$2(key_1, ctx) {
    	let first;
    	let current;

    	const ytick = new YTick({
    			props: {
    				y: /*y*/ ctx[5],
    				value: /*tick*/ ctx[31],
    				duration: transitionDuration$1,
    				chartWidth: width$1 - /*margin*/ ctx[14].right - /*margin*/ ctx[14].left
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(ytick.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(ytick, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const ytick_changes = {};
    			if (dirty[0] & /*y*/ 32) ytick_changes.y = /*y*/ ctx[5];
    			if (dirty[0] & /*yTicks*/ 8192) ytick_changes.value = /*tick*/ ctx[31];
    			ytick.$set(ytick_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(ytick.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(ytick.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(ytick, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2$2.name,
    		type: "each",
    		source: "(281:10) {#each yTicks as tick (tick)}",
    		ctx
    	});

    	return block;
    }

    // (290:8) {#each data as lineElement (lineElement.id)}
    function create_each_block_1$2(key_1, ctx) {
    	let first;
    	let path0;
    	let path0_clip_path_value;
    	let path0_fill_value;
    	let path0_d_value;
    	let path1;
    	let path1_clip_path_value;
    	let path1_fill_value;
    	let path1_d_value;
    	let current;

    	const line0 = new Line({
    			props: {
    				linePath: /*line*/ ctx[3](/*lineElement*/ ctx[28].values.map(func_2)),
    				color: /*colorMap*/ ctx[15].get(/*lineElement*/ ctx[28].id),
    				duration: transitionDuration$1,
    				strokeWidth
    			},
    			$$inline: true
    		});

    	const line1 = new Line({
    			props: {
    				linePath: /*line*/ ctx[3](/*lineElement*/ ctx[28].values.map(func_3)),
    				dashArray,
    				color: /*colorMap*/ ctx[15].get(/*lineElement*/ ctx[28].id),
    				duration: transitionDuration$1,
    				strokeWidth
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(line0.$$.fragment);
    			create_component(line1.$$.fragment);
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			attr_dev(path0, "clip-path", path0_clip_path_value = `url(#above${/*lineElement*/ ctx[28].id})`);
    			attr_dev(path0, "fill", path0_fill_value = `url(#gradientBelow${/*lineElement*/ ctx[28].id})`);
    			attr_dev(path0, "d", path0_d_value = /*aboveArea*/ ctx[8](addExtentToValues(/*lineElement*/ ctx[28].values).map(func_4)));
    			add_location(path0, file$7, 314, 10, 8987);
    			attr_dev(path1, "clip-path", path1_clip_path_value = `url(#below${/*lineElement*/ ctx[28].id})`);
    			attr_dev(path1, "fill", path1_fill_value = `url(#gradientAbove${/*lineElement*/ ctx[28].id})`);
    			attr_dev(path1, "d", path1_d_value = /*belowArea*/ ctx[9](addExtentToValues(/*lineElement*/ ctx[28].values).map(func_5)));
    			add_location(path1, file$7, 330, 10, 9512);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(line0, target, anchor);
    			mount_component(line1, target, anchor);
    			insert_dev(target, path0, anchor);
    			insert_dev(target, path1, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const line0_changes = {};
    			if (dirty[0] & /*line, data*/ 9) line0_changes.linePath = /*line*/ ctx[3](/*lineElement*/ ctx[28].values.map(func_2));
    			if (dirty[0] & /*data*/ 1) line0_changes.color = /*colorMap*/ ctx[15].get(/*lineElement*/ ctx[28].id);
    			line0.$set(line0_changes);
    			const line1_changes = {};
    			if (dirty[0] & /*line, data*/ 9) line1_changes.linePath = /*line*/ ctx[3](/*lineElement*/ ctx[28].values.map(func_3));
    			if (dirty[0] & /*data*/ 1) line1_changes.color = /*colorMap*/ ctx[15].get(/*lineElement*/ ctx[28].id);
    			line1.$set(line1_changes);

    			if (!current || dirty[0] & /*data*/ 1 && path0_clip_path_value !== (path0_clip_path_value = `url(#above${/*lineElement*/ ctx[28].id})`)) {
    				attr_dev(path0, "clip-path", path0_clip_path_value);
    			}

    			if (!current || dirty[0] & /*data*/ 1 && path0_fill_value !== (path0_fill_value = `url(#gradientBelow${/*lineElement*/ ctx[28].id})`)) {
    				attr_dev(path0, "fill", path0_fill_value);
    			}

    			if (!current || dirty[0] & /*aboveArea, data*/ 257 && path0_d_value !== (path0_d_value = /*aboveArea*/ ctx[8](addExtentToValues(/*lineElement*/ ctx[28].values).map(func_4)))) {
    				attr_dev(path0, "d", path0_d_value);
    			}

    			if (!current || dirty[0] & /*data*/ 1 && path1_clip_path_value !== (path1_clip_path_value = `url(#below${/*lineElement*/ ctx[28].id})`)) {
    				attr_dev(path1, "clip-path", path1_clip_path_value);
    			}

    			if (!current || dirty[0] & /*data*/ 1 && path1_fill_value !== (path1_fill_value = `url(#gradientAbove${/*lineElement*/ ctx[28].id})`)) {
    				attr_dev(path1, "fill", path1_fill_value);
    			}

    			if (!current || dirty[0] & /*belowArea, data*/ 513 && path1_d_value !== (path1_d_value = /*belowArea*/ ctx[9](addExtentToValues(/*lineElement*/ ctx[28].values).map(func_5)))) {
    				attr_dev(path1, "d", path1_d_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(line0.$$.fragment, local);
    			transition_in(line1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(line0.$$.fragment, local);
    			transition_out(line1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(line0, detaching);
    			destroy_component(line1, detaching);
    			if (detaching) detach_dev(path0);
    			if (detaching) detach_dev(path1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$2.name,
    		type: "each",
    		source: "(290:8) {#each data as lineElement (lineElement.id)}",
    		ctx
    	});

    	return block;
    }

    // (375:8) {#if hoverData && data.length > 0}
    function create_if_block_2$1(ctx) {
    	let line_1;
    	let line_1_x__value;
    	let line_1_x__value_1;
    	let line_1_y__value;
    	let line_1_y__value_1;
    	let each_1_anchor;
    	let each_value = /*hoverData*/ ctx[2].values;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			line_1 = svg_element("line");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			attr_dev(line_1, "x1", line_1_x__value = /*x*/ ctx[4](/*hoverData*/ ctx[2].year));
    			attr_dev(line_1, "x2", line_1_x__value_1 = /*x*/ ctx[4](/*hoverData*/ ctx[2].year));
    			attr_dev(line_1, "y1", line_1_y__value = /*margin*/ ctx[14].top);
    			attr_dev(line_1, "y2", line_1_y__value_1 = height$1 - /*margin*/ ctx[14].bottom);
    			attr_dev(line_1, "stroke", "#333");
    			attr_dev(line_1, "stroke-width", "2");
    			add_location(line_1, file$7, 375, 10, 11058);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, line_1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*x, hoverData*/ 20 && line_1_x__value !== (line_1_x__value = /*x*/ ctx[4](/*hoverData*/ ctx[2].year))) {
    				attr_dev(line_1, "x1", line_1_x__value);
    			}

    			if (dirty[0] & /*x, hoverData*/ 20 && line_1_x__value_1 !== (line_1_x__value_1 = /*x*/ ctx[4](/*hoverData*/ ctx[2].year))) {
    				attr_dev(line_1, "x2", line_1_x__value_1);
    			}

    			if (dirty[0] & /*x, hoverData, y*/ 52) {
    				each_value = /*hoverData*/ ctx[2].values;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(line_1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(375:8) {#if hoverData && data.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (384:10) {#each hoverData.values as row}
    function create_each_block$3(ctx) {
    	let g0;
    	let circle0;
    	let g0_transform_value;
    	let g1;
    	let circle1;
    	let g1_transform_value;

    	const block = {
    		c: function create() {
    			g0 = svg_element("g");
    			circle0 = svg_element("circle");
    			g1 = svg_element("g");
    			circle1 = svg_element("circle");
    			attr_dev(circle0, "cx", "0");
    			attr_dev(circle0, "cy", "0");
    			attr_dev(circle0, "r", "5");
    			attr_dev(circle0, "stroke", "#333");
    			attr_dev(circle0, "fill", "none");
    			add_location(circle0, file$7, 385, 14, 11415);
    			attr_dev(g0, "transform", g0_transform_value = "translate(" + /*x*/ ctx[4](/*hoverData*/ ctx[2].year) + " " + /*y*/ ctx[5](/*row*/ ctx[25].demandMean) + ")");
    			add_location(g0, file$7, 384, 12, 11333);
    			attr_dev(circle1, "cx", "0");
    			attr_dev(circle1, "cy", "0");
    			attr_dev(circle1, "r", "5");
    			attr_dev(circle1, "stroke", "#333");
    			attr_dev(circle1, "fill", "none");
    			add_location(circle1, file$7, 388, 14, 11585);
    			attr_dev(g1, "transform", g1_transform_value = "translate(" + /*x*/ ctx[4](/*hoverData*/ ctx[2].year) + " " + /*y*/ ctx[5](/*row*/ ctx[25].supplyMean) + ")");
    			add_location(g1, file$7, 387, 12, 11503);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g0, anchor);
    			append_dev(g0, circle0);
    			insert_dev(target, g1, anchor);
    			append_dev(g1, circle1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*x, hoverData, y*/ 52 && g0_transform_value !== (g0_transform_value = "translate(" + /*x*/ ctx[4](/*hoverData*/ ctx[2].year) + " " + /*y*/ ctx[5](/*row*/ ctx[25].demandMean) + ")")) {
    				attr_dev(g0, "transform", g0_transform_value);
    			}

    			if (dirty[0] & /*x, hoverData, y*/ 52 && g1_transform_value !== (g1_transform_value = "translate(" + /*x*/ ctx[4](/*hoverData*/ ctx[2].year) + " " + /*y*/ ctx[5](/*row*/ ctx[25].supplyMean) + ")")) {
    				attr_dev(g1, "transform", g1_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g0);
    			if (detaching) detach_dev(g1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(384:10) {#each hoverData.values as row}",
    		ctx
    	});

    	return block;
    }

    // (403:4) {#if hoverData}
    function create_if_block_1$1(ctx) {
    	let div;
    	let current;

    	const differencetooltiptable = new DifferenceToolTipTable({
    			props: { rows: /*hoverData*/ ctx[2].values },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(differencetooltiptable.$$.fragment);
    			attr_dev(div, "class", "tooltip");
    			set_style(div, "position", "fixed");
    			set_style(div, "top", /*lineChartPosition*/ ctx[1].clientY + "px");

    			set_style(div, "left", (/*hoverData*/ ctx[2].year < /*xHalfway*/ ctx[11]
    			? /*lineChartPosition*/ ctx[1].left + /*lineChartPosition*/ ctx[1].scaling * /*x*/ ctx[4](/*hoverData*/ ctx[2].year) + 8
    			: /*lineChartPosition*/ ctx[1].left + /*lineChartPosition*/ ctx[1].scaling * /*x*/ ctx[4](/*hoverData*/ ctx[2].year) - 318) + "px");

    			set_style(div, "background", "rgba(255, 255, 255, 0.9)");
    			set_style(div, "border-radius", "5px");
    			set_style(div, "border", "1px\r\n        solid #333333");
    			set_style(div, "padding", "3px\r\n        3px");
    			set_style(div, "z-index", "200");
    			set_style(div, "font-weight", "600");
    			set_style(div, "width", "310px");
    			set_style(div, "pointer-events", "none");
    			add_location(div, file$7, 403, 6, 11956);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(differencetooltiptable, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const differencetooltiptable_changes = {};
    			if (dirty[0] & /*hoverData*/ 4) differencetooltiptable_changes.rows = /*hoverData*/ ctx[2].values;
    			differencetooltiptable.$set(differencetooltiptable_changes);

    			if (!current || dirty[0] & /*lineChartPosition*/ 2) {
    				set_style(div, "top", /*lineChartPosition*/ ctx[1].clientY + "px");
    			}

    			if (!current || dirty[0] & /*hoverData, xHalfway, lineChartPosition, x*/ 2070) {
    				set_style(div, "left", (/*hoverData*/ ctx[2].year < /*xHalfway*/ ctx[11]
    				? /*lineChartPosition*/ ctx[1].left + /*lineChartPosition*/ ctx[1].scaling * /*x*/ ctx[4](/*hoverData*/ ctx[2].year) + 8
    				: /*lineChartPosition*/ ctx[1].left + /*lineChartPosition*/ ctx[1].scaling * /*x*/ ctx[4](/*hoverData*/ ctx[2].year) - 318) + "px");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(differencetooltiptable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(differencetooltiptable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(differencetooltiptable);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(403:4) {#if hoverData}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let t;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*data*/ ctx[0].length > 0) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const linechartlegendtable = new LineChartLegendTable({
    			props: {
    				legendData: /*data*/ ctx[0].map(/*func_6*/ ctx[23])
    			},
    			$$inline: true
    		});

    	linechartlegendtable.$on("deleteProjection", /*deleteProjection_handler*/ ctx[24]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			t = space();
    			create_component(linechartlegendtable.$$.fragment);
    			attr_dev(div, "id", "line-chart-div");
    			add_location(div, file$7, 189, 0, 5112);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			append_dev(div, t);
    			mount_component(linechartlegendtable, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, t);
    			}

    			const linechartlegendtable_changes = {};
    			if (dirty[0] & /*data*/ 1) linechartlegendtable_changes.legendData = /*data*/ ctx[0].map(/*func_6*/ ctx[23]);
    			linechartlegendtable.$set(linechartlegendtable_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(linechartlegendtable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(linechartlegendtable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    			destroy_component(linechartlegendtable);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const width$1 = 800;
    const height$1 = 475;
    const transitionDuration$1 = 400;
    const dashArray = "4";
    const strokeWidth = 2;

    function addExtentToValues(values) {
    	const [min, max] = extent(values.flatMap(d => [d.supplyMean, d.demandMean]));
    	return values.map(d => Object.assign({ min, max }, d));
    }

    function getContainerCoords$1(node, event) {
    	var svg = node.ownerSVGElement || node;

    	if (svg.createSVGPoint) {
    		var point = svg.createSVGPoint();
    		(point.x = event.clientX, point.y = event.clientY);
    		point = point.matrixTransform(node.getScreenCTM().inverse());
    		return [point.x, point.y];
    	}

    	var rect = node.getBoundingClientRect();

    	return [
    		event.clientX - rect.left - node.clientLeft,
    		event.clientY - rect.top - node.clientTop
    	];
    }

    const func = ({ year, demandMean }) => ({ year, value: demandMean });
    const func_1 = ({ year, demandMean }) => ({ year, value: demandMean });
    const func_2 = ({ year, supplyMean }) => ({ year, value: supplyMean });
    const func_3 = ({ year, demandMean }) => ({ year, value: demandMean });

    const func_4 = ({ year, supplyMean, demandMean, min, max }) => ({
    	year,
    	supplyMean,
    	demandMean,
    	value: supplyMean,
    	min,
    	max
    });

    const func_5 = ({ year, supplyMean, demandMean, min, max }) => ({
    	year,
    	supplyMean,
    	demandMean,
    	value: supplyMean,
    	min,
    	max
    });

    function instance$7($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	const margin = { top: 30, right: 60, bottom: 65, left: 90 };

    	const colors = [
    		"#1f77b4",
    		"#ff7f0e",
    		"#2ca02c",
    		"#d62728",
    		"#9467bd",
    		"#8c564b",
    		"#e377c2",
    		"#7f7f7f",
    		"#bcbd22",
    		"#17becf"
    	];

    	let colorMap = new Map();
    	const curve = monotoneX;
    	let lineChartPosition = [];
    	let hoverData;

    	function handleHover(e) {
    		const { clientY } = e;
    		let hoverYear = Math.round(x.invert(getContainerCoords$1(this, e)[0]));
    		const boundingRect = e.target.getBoundingClientRect();
    		const scaling = boundingRect.width / width$1;

    		$$invalidate(1, lineChartPosition = {
    			left: boundingRect.left,
    			right: boundingRect.right,
    			top: boundingRect.top,
    			scaling,
    			clientY
    		});

    		if (hoverYear < xExtent[0]) {
    			hoverYear = xExtent[0];
    		} else if (hoverYear > xExtent[1]) {
    			hoverYear = xExtent[1];
    		}

    		$$invalidate(2, hoverData = {
    			year: hoverYear,
    			values: byYearData.get(hoverYear).sort(function (a, b) {
    				return descending(mean([a.supplyMean, a.demandMean]), mean([b.supplyMean, b.demandMean]));
    			})
    		});
    	}

    	function handleMouseLeave() {
    		$$invalidate(2, hoverData = undefined);
    	}

    	const writable_props = ["data"];

    	Object_1$2.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<LineChartDifference> was created with unknown prop '${key}'`);
    	});

    	const func_6 = (d, i) => ({
    		params: d.params,
    		color: colorMap.get(d.id),
    		id: d.id
    	});

    	function deleteProjection_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    	};

    	$$self.$capture_state = () => {
    		return {
    			data,
    			colorMap,
    			lineChartPosition,
    			hoverData,
    			line,
    			x,
    			y,
    			aboveClip,
    			belowClip,
    			aboveArea,
    			belowArea,
    			flatData,
    			byYearData,
    			xExtent,
    			xHalfway,
    			yMax,
    			xTicks,
    			yTicks
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("colorMap" in $$props) $$invalidate(15, colorMap = $$props.colorMap);
    		if ("lineChartPosition" in $$props) $$invalidate(1, lineChartPosition = $$props.lineChartPosition);
    		if ("hoverData" in $$props) $$invalidate(2, hoverData = $$props.hoverData);
    		if ("line" in $$props) $$invalidate(3, line = $$props.line);
    		if ("x" in $$props) $$invalidate(4, x = $$props.x);
    		if ("y" in $$props) $$invalidate(5, y = $$props.y);
    		if ("aboveClip" in $$props) $$invalidate(6, aboveClip = $$props.aboveClip);
    		if ("belowClip" in $$props) $$invalidate(7, belowClip = $$props.belowClip);
    		if ("aboveArea" in $$props) $$invalidate(8, aboveArea = $$props.aboveArea);
    		if ("belowArea" in $$props) $$invalidate(9, belowArea = $$props.belowArea);
    		if ("flatData" in $$props) $$invalidate(18, flatData = $$props.flatData);
    		if ("byYearData" in $$props) byYearData = $$props.byYearData;
    		if ("xExtent" in $$props) $$invalidate(10, xExtent = $$props.xExtent);
    		if ("xHalfway" in $$props) $$invalidate(11, xHalfway = $$props.xHalfway);
    		if ("yMax" in $$props) $$invalidate(20, yMax = $$props.yMax);
    		if ("xTicks" in $$props) $$invalidate(12, xTicks = $$props.xTicks);
    		if ("yTicks" in $$props) $$invalidate(13, yTicks = $$props.yTicks);
    	};

    	let line;
    	let aboveClip;
    	let belowClip;
    	let aboveArea;
    	let belowArea;
    	let flatData;
    	let byYearData;
    	let xExtent;
    	let xHalfway;
    	let yMax;
    	let x;
    	let xTicks;
    	let y;
    	let yTicks;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 {
    				colorMap.forEach(function (value, key) {
    					if (!data.map(d => d.id).includes(+key)) {
    						colorMap.delete(key);
    					}
    				});

    				data.forEach(function (d) {
    					if (!colorMap.has(d.id)) {
    						const availableColors = colors.filter(d => !Array.from(colorMap.values()).includes(d));
    						colorMap.set(d.id, availableColors[0]);
    					}
    				});
    			}
    		}

    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 $$invalidate(18, flatData = data.map(d => d.values.map(e => Object.assign(
    				{
    					id: d.id,
    					rateOrTotal: d.params.find(d => d[0] == "rateOrTotal")[1],
    					color: colorMap.get(d.id)
    				},
    				e
    			))).flat());
    		}

    		if ($$self.$$.dirty[0] & /*flatData*/ 262144) {
    			 $$invalidate(10, xExtent = flatData.length > 0
    			? extent(flatData, d => d.year)
    			: [2015, 2032]);
    		}

    		if ($$self.$$.dirty[0] & /*xExtent*/ 1024) {
    			 $$invalidate(4, x = linear$1().domain(xExtent).range([margin.left, width$1 - margin.right]));
    		}

    		if ($$self.$$.dirty[0] & /*flatData*/ 262144) {
    			 $$invalidate(20, yMax = flatData.length > 0
    			? max(flatData.flatMap(d => [d.supplyMean, d.demandMean]))
    			: 50);
    		}

    		if ($$self.$$.dirty[0] & /*yMax*/ 1048576) {
    			 $$invalidate(5, y = linear$1().domain([0, yMax]).nice().range([height$1 - margin.bottom, margin.top]));
    		}

    		if ($$self.$$.dirty[0] & /*x, y*/ 48) {
    			 $$invalidate(3, line = d3line().curve(curve).defined(d => !isNaN(d.value)).x(d => x(d.year)).y(d => y(d.value)));
    		}

    		if ($$self.$$.dirty[0] & /*x, y*/ 48) {
    			 $$invalidate(6, aboveClip = d3area().x(d => x(d.year)).y0(0).y1(d => y(d.value)).curve(curve));
    		}

    		if ($$self.$$.dirty[0] & /*x, y*/ 48) {
    			 $$invalidate(7, belowClip = d3area().x(d => x(d.year)).y0(height$1).y1(d => y(d.value)).curve(curve));
    		}

    		if ($$self.$$.dirty[0] & /*x, y*/ 48) {
    			 $$invalidate(8, aboveArea = d3area().curve(curve).x(d => x(d.year)).y0(d => y(d.supplyMean)).y1(d => y(d.demandMean)));
    		}

    		if ($$self.$$.dirty[0] & /*x, y*/ 48) {
    			 $$invalidate(9, belowArea = d3area().curve(curve).x(d => x(d.year)).y0(d => y(d.demandMean)).y1(d => y(d.supplyMean)));
    		}

    		if ($$self.$$.dirty[0] & /*flatData*/ 262144) {
    			 byYearData = group(flatData, d => d.year);
    		}

    		if ($$self.$$.dirty[0] & /*xExtent*/ 1024) {
    			 $$invalidate(11, xHalfway = Math.round((xExtent[1] + xExtent[0]) / 2));
    		}

    		if ($$self.$$.dirty[0] & /*x*/ 16) {
    			 $$invalidate(12, xTicks = x.ticks());
    		}

    		if ($$self.$$.dirty[0] & /*y*/ 32) {
    			 $$invalidate(13, yTicks = y.ticks());
    		}
    	};

    	return [
    		data,
    		lineChartPosition,
    		hoverData,
    		line,
    		x,
    		y,
    		aboveClip,
    		belowClip,
    		aboveArea,
    		belowArea,
    		xExtent,
    		xHalfway,
    		xTicks,
    		yTicks,
    		margin,
    		colorMap,
    		handleHover,
    		handleMouseLeave,
    		flatData,
    		byYearData,
    		yMax,
    		colors,
    		curve,
    		func_6,
    		deleteProjection_handler
    	];
    }

    class LineChartDifference extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { data: 0 }, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "LineChartDifference",
    			options,
    			id: create_fragment$7.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*data*/ ctx[0] === undefined && !("data" in props)) {
    			console.warn("<LineChartDifference> was created without expected prop 'data'");
    		}
    	}

    	get data() {
    		throw new Error("<LineChartDifference>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<LineChartDifference>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    // Adds floating point numbers with twice the normal precision.
    // Reference: J. R. Shewchuk, Adaptive Precision Floating-Point Arithmetic and
    // Fast Robust Geometric Predicates, Discrete & Computational Geometry 18(3)
    // 305–363 (1997).
    // Code adapted from GeographicLib by Charles F. F. Karney,
    // http://geographiclib.sourceforge.net/

    function adder() {
      return new Adder;
    }

    function Adder() {
      this.reset();
    }

    Adder.prototype = {
      constructor: Adder,
      reset: function() {
        this.s = // rounded value
        this.t = 0; // exact error
      },
      add: function(y) {
        add(temp, y, this.t);
        add(this, temp.s, this.s);
        if (this.s) this.t += temp.t;
        else this.s = temp.t;
      },
      valueOf: function() {
        return this.s;
      }
    };

    var temp = new Adder;

    function add(adder, a, b) {
      var x = adder.s = a + b,
          bv = x - a,
          av = x - bv;
      adder.t = (a - av) + (b - bv);
    }

    var epsilon$1 = 1e-6;
    var pi$1 = Math.PI;
    var halfPi = pi$1 / 2;
    var quarterPi = pi$1 / 4;
    var tau$1 = pi$1 * 2;

    var degrees = 180 / pi$1;
    var radians = pi$1 / 180;

    var abs = Math.abs;
    var atan = Math.atan;
    var atan2 = Math.atan2;
    var cos = Math.cos;
    var sin = Math.sin;
    var sign$1 = Math.sign || function(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };
    var sqrt = Math.sqrt;

    function acos(x) {
      return x > 1 ? 0 : x < -1 ? pi$1 : Math.acos(x);
    }

    function asin(x) {
      return x > 1 ? halfPi : x < -1 ? -halfPi : Math.asin(x);
    }

    function noop$1() {}

    function streamGeometry(geometry, stream) {
      if (geometry && streamGeometryType.hasOwnProperty(geometry.type)) {
        streamGeometryType[geometry.type](geometry, stream);
      }
    }

    var streamObjectType = {
      Feature: function(object, stream) {
        streamGeometry(object.geometry, stream);
      },
      FeatureCollection: function(object, stream) {
        var features = object.features, i = -1, n = features.length;
        while (++i < n) streamGeometry(features[i].geometry, stream);
      }
    };

    var streamGeometryType = {
      Sphere: function(object, stream) {
        stream.sphere();
      },
      Point: function(object, stream) {
        object = object.coordinates;
        stream.point(object[0], object[1], object[2]);
      },
      MultiPoint: function(object, stream) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) object = coordinates[i], stream.point(object[0], object[1], object[2]);
      },
      LineString: function(object, stream) {
        streamLine(object.coordinates, stream, 0);
      },
      MultiLineString: function(object, stream) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) streamLine(coordinates[i], stream, 0);
      },
      Polygon: function(object, stream) {
        streamPolygon(object.coordinates, stream);
      },
      MultiPolygon: function(object, stream) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) streamPolygon(coordinates[i], stream);
      },
      GeometryCollection: function(object, stream) {
        var geometries = object.geometries, i = -1, n = geometries.length;
        while (++i < n) streamGeometry(geometries[i], stream);
      }
    };

    function streamLine(coordinates, stream, closed) {
      var i = -1, n = coordinates.length - closed, coordinate;
      stream.lineStart();
      while (++i < n) coordinate = coordinates[i], stream.point(coordinate[0], coordinate[1], coordinate[2]);
      stream.lineEnd();
    }

    function streamPolygon(coordinates, stream) {
      var i = -1, n = coordinates.length;
      stream.polygonStart();
      while (++i < n) streamLine(coordinates[i], stream, 1);
      stream.polygonEnd();
    }

    function geoStream(object, stream) {
      if (object && streamObjectType.hasOwnProperty(object.type)) {
        streamObjectType[object.type](object, stream);
      } else {
        streamGeometry(object, stream);
      }
    }

    function spherical(cartesian) {
      return [atan2(cartesian[1], cartesian[0]), asin(cartesian[2])];
    }

    function cartesian(spherical) {
      var lambda = spherical[0], phi = spherical[1], cosPhi = cos(phi);
      return [cosPhi * cos(lambda), cosPhi * sin(lambda), sin(phi)];
    }

    function cartesianDot(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function cartesianCross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    // TODO return a
    function cartesianAddInPlace(a, b) {
      a[0] += b[0], a[1] += b[1], a[2] += b[2];
    }

    function cartesianScale(vector, k) {
      return [vector[0] * k, vector[1] * k, vector[2] * k];
    }

    // TODO return d
    function cartesianNormalizeInPlace(d) {
      var l = sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      d[0] /= l, d[1] /= l, d[2] /= l;
    }

    function compose(a, b) {

      function compose(x, y) {
        return x = a(x, y), b(x[0], x[1]);
      }

      if (a.invert && b.invert) compose.invert = function(x, y) {
        return x = b.invert(x, y), x && a.invert(x[0], x[1]);
      };

      return compose;
    }

    function rotationIdentity(lambda, phi) {
      return [abs(lambda) > pi$1 ? lambda + Math.round(-lambda / tau$1) * tau$1 : lambda, phi];
    }

    rotationIdentity.invert = rotationIdentity;

    function rotateRadians(deltaLambda, deltaPhi, deltaGamma) {
      return (deltaLambda %= tau$1) ? (deltaPhi || deltaGamma ? compose(rotationLambda(deltaLambda), rotationPhiGamma(deltaPhi, deltaGamma))
        : rotationLambda(deltaLambda))
        : (deltaPhi || deltaGamma ? rotationPhiGamma(deltaPhi, deltaGamma)
        : rotationIdentity);
    }

    function forwardRotationLambda(deltaLambda) {
      return function(lambda, phi) {
        return lambda += deltaLambda, [lambda > pi$1 ? lambda - tau$1 : lambda < -pi$1 ? lambda + tau$1 : lambda, phi];
      };
    }

    function rotationLambda(deltaLambda) {
      var rotation = forwardRotationLambda(deltaLambda);
      rotation.invert = forwardRotationLambda(-deltaLambda);
      return rotation;
    }

    function rotationPhiGamma(deltaPhi, deltaGamma) {
      var cosDeltaPhi = cos(deltaPhi),
          sinDeltaPhi = sin(deltaPhi),
          cosDeltaGamma = cos(deltaGamma),
          sinDeltaGamma = sin(deltaGamma);

      function rotation(lambda, phi) {
        var cosPhi = cos(phi),
            x = cos(lambda) * cosPhi,
            y = sin(lambda) * cosPhi,
            z = sin(phi),
            k = z * cosDeltaPhi + x * sinDeltaPhi;
        return [
          atan2(y * cosDeltaGamma - k * sinDeltaGamma, x * cosDeltaPhi - z * sinDeltaPhi),
          asin(k * cosDeltaGamma + y * sinDeltaGamma)
        ];
      }

      rotation.invert = function(lambda, phi) {
        var cosPhi = cos(phi),
            x = cos(lambda) * cosPhi,
            y = sin(lambda) * cosPhi,
            z = sin(phi),
            k = z * cosDeltaGamma - y * sinDeltaGamma;
        return [
          atan2(y * cosDeltaGamma + z * sinDeltaGamma, x * cosDeltaPhi + k * sinDeltaPhi),
          asin(k * cosDeltaPhi - x * sinDeltaPhi)
        ];
      };

      return rotation;
    }

    // Generates a circle centered at [0°, 0°], with a given radius and precision.
    function circleStream(stream, radius, delta, direction, t0, t1) {
      if (!delta) return;
      var cosRadius = cos(radius),
          sinRadius = sin(radius),
          step = direction * delta;
      if (t0 == null) {
        t0 = radius + direction * tau$1;
        t1 = radius - step / 2;
      } else {
        t0 = circleRadius(cosRadius, t0);
        t1 = circleRadius(cosRadius, t1);
        if (direction > 0 ? t0 < t1 : t0 > t1) t0 += direction * tau$1;
      }
      for (var point, t = t0; direction > 0 ? t > t1 : t < t1; t -= step) {
        point = spherical([cosRadius, -sinRadius * cos(t), -sinRadius * sin(t)]);
        stream.point(point[0], point[1]);
      }
    }

    // Returns the signed angle of a cartesian point relative to [cosRadius, 0, 0].
    function circleRadius(cosRadius, point) {
      point = cartesian(point), point[0] -= cosRadius;
      cartesianNormalizeInPlace(point);
      var radius = acos(-point[1]);
      return ((-point[2] < 0 ? -radius : radius) + tau$1 - epsilon$1) % tau$1;
    }

    function clipBuffer() {
      var lines = [],
          line;
      return {
        point: function(x, y) {
          line.push([x, y]);
        },
        lineStart: function() {
          lines.push(line = []);
        },
        lineEnd: noop$1,
        rejoin: function() {
          if (lines.length > 1) lines.push(lines.pop().concat(lines.shift()));
        },
        result: function() {
          var result = lines;
          lines = [];
          line = null;
          return result;
        }
      };
    }

    function pointEqual(a, b) {
      return abs(a[0] - b[0]) < epsilon$1 && abs(a[1] - b[1]) < epsilon$1;
    }

    function Intersection(point, points, other, entry) {
      this.x = point;
      this.z = points;
      this.o = other; // another intersection
      this.e = entry; // is an entry?
      this.v = false; // visited
      this.n = this.p = null; // next & previous
    }

    // A generalized polygon clipping algorithm: given a polygon that has been cut
    // into its visible line segments, and rejoins the segments by interpolating
    // along the clip edge.
    function clipRejoin(segments, compareIntersection, startInside, interpolate, stream) {
      var subject = [],
          clip = [],
          i,
          n;

      segments.forEach(function(segment) {
        if ((n = segment.length - 1) <= 0) return;
        var n, p0 = segment[0], p1 = segment[n], x;

        // If the first and last points of a segment are coincident, then treat as a
        // closed ring. TODO if all rings are closed, then the winding order of the
        // exterior ring should be checked.
        if (pointEqual(p0, p1)) {
          stream.lineStart();
          for (i = 0; i < n; ++i) stream.point((p0 = segment[i])[0], p0[1]);
          stream.lineEnd();
          return;
        }

        subject.push(x = new Intersection(p0, segment, null, true));
        clip.push(x.o = new Intersection(p0, null, x, false));
        subject.push(x = new Intersection(p1, segment, null, false));
        clip.push(x.o = new Intersection(p1, null, x, true));
      });

      if (!subject.length) return;

      clip.sort(compareIntersection);
      link(subject);
      link(clip);

      for (i = 0, n = clip.length; i < n; ++i) {
        clip[i].e = startInside = !startInside;
      }

      var start = subject[0],
          points,
          point;

      while (1) {
        // Find first unvisited intersection.
        var current = start,
            isSubject = true;
        while (current.v) if ((current = current.n) === start) return;
        points = current.z;
        stream.lineStart();
        do {
          current.v = current.o.v = true;
          if (current.e) {
            if (isSubject) {
              for (i = 0, n = points.length; i < n; ++i) stream.point((point = points[i])[0], point[1]);
            } else {
              interpolate(current.x, current.n.x, 1, stream);
            }
            current = current.n;
          } else {
            if (isSubject) {
              points = current.p.z;
              for (i = points.length - 1; i >= 0; --i) stream.point((point = points[i])[0], point[1]);
            } else {
              interpolate(current.x, current.p.x, -1, stream);
            }
            current = current.p;
          }
          current = current.o;
          points = current.z;
          isSubject = !isSubject;
        } while (!current.v);
        stream.lineEnd();
      }
    }

    function link(array) {
      if (!(n = array.length)) return;
      var n,
          i = 0,
          a = array[0],
          b;
      while (++i < n) {
        a.n = b = array[i];
        b.p = a;
        a = b;
      }
      a.n = b = array[0];
      b.p = a;
    }

    var sum = adder();

    function longitude(point) {
      if (abs(point[0]) <= pi$1)
        return point[0];
      else
        return sign$1(point[0]) * ((abs(point[0]) + pi$1) % tau$1 - pi$1);
    }

    function polygonContains(polygon, point) {
      var lambda = longitude(point),
          phi = point[1],
          sinPhi = sin(phi),
          normal = [sin(lambda), -cos(lambda), 0],
          angle = 0,
          winding = 0;

      sum.reset();

      if (sinPhi === 1) phi = halfPi + epsilon$1;
      else if (sinPhi === -1) phi = -halfPi - epsilon$1;

      for (var i = 0, n = polygon.length; i < n; ++i) {
        if (!(m = (ring = polygon[i]).length)) continue;
        var ring,
            m,
            point0 = ring[m - 1],
            lambda0 = longitude(point0),
            phi0 = point0[1] / 2 + quarterPi,
            sinPhi0 = sin(phi0),
            cosPhi0 = cos(phi0);

        for (var j = 0; j < m; ++j, lambda0 = lambda1, sinPhi0 = sinPhi1, cosPhi0 = cosPhi1, point0 = point1) {
          var point1 = ring[j],
              lambda1 = longitude(point1),
              phi1 = point1[1] / 2 + quarterPi,
              sinPhi1 = sin(phi1),
              cosPhi1 = cos(phi1),
              delta = lambda1 - lambda0,
              sign = delta >= 0 ? 1 : -1,
              absDelta = sign * delta,
              antimeridian = absDelta > pi$1,
              k = sinPhi0 * sinPhi1;

          sum.add(atan2(k * sign * sin(absDelta), cosPhi0 * cosPhi1 + k * cos(absDelta)));
          angle += antimeridian ? delta + sign * tau$1 : delta;

          // Are the longitudes either side of the point’s meridian (lambda),
          // and are the latitudes smaller than the parallel (phi)?
          if (antimeridian ^ lambda0 >= lambda ^ lambda1 >= lambda) {
            var arc = cartesianCross(cartesian(point0), cartesian(point1));
            cartesianNormalizeInPlace(arc);
            var intersection = cartesianCross(normal, arc);
            cartesianNormalizeInPlace(intersection);
            var phiArc = (antimeridian ^ delta >= 0 ? -1 : 1) * asin(intersection[2]);
            if (phi > phiArc || phi === phiArc && (arc[0] || arc[1])) {
              winding += antimeridian ^ delta >= 0 ? 1 : -1;
            }
          }
        }
      }

      // First, determine whether the South pole is inside or outside:
      //
      // It is inside if:
      // * the polygon winds around it in a clockwise direction.
      // * the polygon does not (cumulatively) wind around it, but has a negative
      //   (counter-clockwise) area.
      //
      // Second, count the (signed) number of times a segment crosses a lambda
      // from the point to the South pole.  If it is zero, then the point is the
      // same side as the South pole.

      return (angle < -epsilon$1 || angle < epsilon$1 && sum < -epsilon$1) ^ (winding & 1);
    }

    function ascending$1(a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function bisector$1(compare) {
      if (compare.length === 1) compare = ascendingComparator$1(compare);
      return {
        left: function(a, x, lo, hi) {
          if (lo == null) lo = 0;
          if (hi == null) hi = a.length;
          while (lo < hi) {
            var mid = lo + hi >>> 1;
            if (compare(a[mid], x) < 0) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        },
        right: function(a, x, lo, hi) {
          if (lo == null) lo = 0;
          if (hi == null) hi = a.length;
          while (lo < hi) {
            var mid = lo + hi >>> 1;
            if (compare(a[mid], x) > 0) hi = mid;
            else lo = mid + 1;
          }
          return lo;
        }
      };
    }

    function ascendingComparator$1(f) {
      return function(d, x) {
        return ascending$1(f(d), x);
      };
    }

    var ascendingBisect$1 = bisector$1(ascending$1);

    function merge(arrays) {
      var n = arrays.length,
          m,
          i = -1,
          j = 0,
          merged,
          array;

      while (++i < n) j += arrays[i].length;
      merged = new Array(j);

      while (--n >= 0) {
        array = arrays[n];
        m = array.length;
        while (--m >= 0) {
          merged[--j] = array[m];
        }
      }

      return merged;
    }

    function clip(pointVisible, clipLine, interpolate, start) {
      return function(sink) {
        var line = clipLine(sink),
            ringBuffer = clipBuffer(),
            ringSink = clipLine(ringBuffer),
            polygonStarted = false,
            polygon,
            segments,
            ring;

        var clip = {
          point: point,
          lineStart: lineStart,
          lineEnd: lineEnd,
          polygonStart: function() {
            clip.point = pointRing;
            clip.lineStart = ringStart;
            clip.lineEnd = ringEnd;
            segments = [];
            polygon = [];
          },
          polygonEnd: function() {
            clip.point = point;
            clip.lineStart = lineStart;
            clip.lineEnd = lineEnd;
            segments = merge(segments);
            var startInside = polygonContains(polygon, start);
            if (segments.length) {
              if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
              clipRejoin(segments, compareIntersection, startInside, interpolate, sink);
            } else if (startInside) {
              if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
              sink.lineStart();
              interpolate(null, null, 1, sink);
              sink.lineEnd();
            }
            if (polygonStarted) sink.polygonEnd(), polygonStarted = false;
            segments = polygon = null;
          },
          sphere: function() {
            sink.polygonStart();
            sink.lineStart();
            interpolate(null, null, 1, sink);
            sink.lineEnd();
            sink.polygonEnd();
          }
        };

        function point(lambda, phi) {
          if (pointVisible(lambda, phi)) sink.point(lambda, phi);
        }

        function pointLine(lambda, phi) {
          line.point(lambda, phi);
        }

        function lineStart() {
          clip.point = pointLine;
          line.lineStart();
        }

        function lineEnd() {
          clip.point = point;
          line.lineEnd();
        }

        function pointRing(lambda, phi) {
          ring.push([lambda, phi]);
          ringSink.point(lambda, phi);
        }

        function ringStart() {
          ringSink.lineStart();
          ring = [];
        }

        function ringEnd() {
          pointRing(ring[0][0], ring[0][1]);
          ringSink.lineEnd();

          var clean = ringSink.clean(),
              ringSegments = ringBuffer.result(),
              i, n = ringSegments.length, m,
              segment,
              point;

          ring.pop();
          polygon.push(ring);
          ring = null;

          if (!n) return;

          // No intersections.
          if (clean & 1) {
            segment = ringSegments[0];
            if ((m = segment.length - 1) > 0) {
              if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
              sink.lineStart();
              for (i = 0; i < m; ++i) sink.point((point = segment[i])[0], point[1]);
              sink.lineEnd();
            }
            return;
          }

          // Rejoin connected segments.
          // TODO reuse ringBuffer.rejoin()?
          if (n > 1 && clean & 2) ringSegments.push(ringSegments.pop().concat(ringSegments.shift()));

          segments.push(ringSegments.filter(validSegment));
        }

        return clip;
      };
    }

    function validSegment(segment) {
      return segment.length > 1;
    }

    // Intersections are sorted along the clip edge. For both antimeridian cutting
    // and circle clipping, the same comparison is used.
    function compareIntersection(a, b) {
      return ((a = a.x)[0] < 0 ? a[1] - halfPi - epsilon$1 : halfPi - a[1])
           - ((b = b.x)[0] < 0 ? b[1] - halfPi - epsilon$1 : halfPi - b[1]);
    }

    var clipAntimeridian = clip(
      function() { return true; },
      clipAntimeridianLine,
      clipAntimeridianInterpolate,
      [-pi$1, -halfPi]
    );

    // Takes a line and cuts into visible segments. Return values: 0 - there were
    // intersections or the line was empty; 1 - no intersections; 2 - there were
    // intersections, and the first and last segments should be rejoined.
    function clipAntimeridianLine(stream) {
      var lambda0 = NaN,
          phi0 = NaN,
          sign0 = NaN,
          clean; // no intersections

      return {
        lineStart: function() {
          stream.lineStart();
          clean = 1;
        },
        point: function(lambda1, phi1) {
          var sign1 = lambda1 > 0 ? pi$1 : -pi$1,
              delta = abs(lambda1 - lambda0);
          if (abs(delta - pi$1) < epsilon$1) { // line crosses a pole
            stream.point(lambda0, phi0 = (phi0 + phi1) / 2 > 0 ? halfPi : -halfPi);
            stream.point(sign0, phi0);
            stream.lineEnd();
            stream.lineStart();
            stream.point(sign1, phi0);
            stream.point(lambda1, phi0);
            clean = 0;
          } else if (sign0 !== sign1 && delta >= pi$1) { // line crosses antimeridian
            if (abs(lambda0 - sign0) < epsilon$1) lambda0 -= sign0 * epsilon$1; // handle degeneracies
            if (abs(lambda1 - sign1) < epsilon$1) lambda1 -= sign1 * epsilon$1;
            phi0 = clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1);
            stream.point(sign0, phi0);
            stream.lineEnd();
            stream.lineStart();
            stream.point(sign1, phi0);
            clean = 0;
          }
          stream.point(lambda0 = lambda1, phi0 = phi1);
          sign0 = sign1;
        },
        lineEnd: function() {
          stream.lineEnd();
          lambda0 = phi0 = NaN;
        },
        clean: function() {
          return 2 - clean; // if intersections, rejoin first and last segments
        }
      };
    }

    function clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1) {
      var cosPhi0,
          cosPhi1,
          sinLambda0Lambda1 = sin(lambda0 - lambda1);
      return abs(sinLambda0Lambda1) > epsilon$1
          ? atan((sin(phi0) * (cosPhi1 = cos(phi1)) * sin(lambda1)
              - sin(phi1) * (cosPhi0 = cos(phi0)) * sin(lambda0))
              / (cosPhi0 * cosPhi1 * sinLambda0Lambda1))
          : (phi0 + phi1) / 2;
    }

    function clipAntimeridianInterpolate(from, to, direction, stream) {
      var phi;
      if (from == null) {
        phi = direction * halfPi;
        stream.point(-pi$1, phi);
        stream.point(0, phi);
        stream.point(pi$1, phi);
        stream.point(pi$1, 0);
        stream.point(pi$1, -phi);
        stream.point(0, -phi);
        stream.point(-pi$1, -phi);
        stream.point(-pi$1, 0);
        stream.point(-pi$1, phi);
      } else if (abs(from[0] - to[0]) > epsilon$1) {
        var lambda = from[0] < to[0] ? pi$1 : -pi$1;
        phi = direction * lambda / 2;
        stream.point(-lambda, phi);
        stream.point(0, phi);
        stream.point(lambda, phi);
      } else {
        stream.point(to[0], to[1]);
      }
    }

    function clipCircle(radius) {
      var cr = cos(radius),
          delta = 6 * radians,
          smallRadius = cr > 0,
          notHemisphere = abs(cr) > epsilon$1; // TODO optimise for this common case

      function interpolate(from, to, direction, stream) {
        circleStream(stream, radius, delta, direction, from, to);
      }

      function visible(lambda, phi) {
        return cos(lambda) * cos(phi) > cr;
      }

      // Takes a line and cuts into visible segments. Return values used for polygon
      // clipping: 0 - there were intersections or the line was empty; 1 - no
      // intersections 2 - there were intersections, and the first and last segments
      // should be rejoined.
      function clipLine(stream) {
        var point0, // previous point
            c0, // code for previous point
            v0, // visibility of previous point
            v00, // visibility of first point
            clean; // no intersections
        return {
          lineStart: function() {
            v00 = v0 = false;
            clean = 1;
          },
          point: function(lambda, phi) {
            var point1 = [lambda, phi],
                point2,
                v = visible(lambda, phi),
                c = smallRadius
                  ? v ? 0 : code(lambda, phi)
                  : v ? code(lambda + (lambda < 0 ? pi$1 : -pi$1), phi) : 0;
            if (!point0 && (v00 = v0 = v)) stream.lineStart();
            // Handle degeneracies.
            // TODO ignore if not clipping polygons.
            if (v !== v0) {
              point2 = intersect(point0, point1);
              if (!point2 || pointEqual(point0, point2) || pointEqual(point1, point2)) {
                point1[0] += epsilon$1;
                point1[1] += epsilon$1;
                v = visible(point1[0], point1[1]);
              }
            }
            if (v !== v0) {
              clean = 0;
              if (v) {
                // outside going in
                stream.lineStart();
                point2 = intersect(point1, point0);
                stream.point(point2[0], point2[1]);
              } else {
                // inside going out
                point2 = intersect(point0, point1);
                stream.point(point2[0], point2[1]);
                stream.lineEnd();
              }
              point0 = point2;
            } else if (notHemisphere && point0 && smallRadius ^ v) {
              var t;
              // If the codes for two points are different, or are both zero,
              // and there this segment intersects with the small circle.
              if (!(c & c0) && (t = intersect(point1, point0, true))) {
                clean = 0;
                if (smallRadius) {
                  stream.lineStart();
                  stream.point(t[0][0], t[0][1]);
                  stream.point(t[1][0], t[1][1]);
                  stream.lineEnd();
                } else {
                  stream.point(t[1][0], t[1][1]);
                  stream.lineEnd();
                  stream.lineStart();
                  stream.point(t[0][0], t[0][1]);
                }
              }
            }
            if (v && (!point0 || !pointEqual(point0, point1))) {
              stream.point(point1[0], point1[1]);
            }
            point0 = point1, v0 = v, c0 = c;
          },
          lineEnd: function() {
            if (v0) stream.lineEnd();
            point0 = null;
          },
          // Rejoin first and last segments if there were intersections and the first
          // and last points were visible.
          clean: function() {
            return clean | ((v00 && v0) << 1);
          }
        };
      }

      // Intersects the great circle between a and b with the clip circle.
      function intersect(a, b, two) {
        var pa = cartesian(a),
            pb = cartesian(b);

        // We have two planes, n1.p = d1 and n2.p = d2.
        // Find intersection line p(t) = c1 n1 + c2 n2 + t (n1 ⨯ n2).
        var n1 = [1, 0, 0], // normal
            n2 = cartesianCross(pa, pb),
            n2n2 = cartesianDot(n2, n2),
            n1n2 = n2[0], // cartesianDot(n1, n2),
            determinant = n2n2 - n1n2 * n1n2;

        // Two polar points.
        if (!determinant) return !two && a;

        var c1 =  cr * n2n2 / determinant,
            c2 = -cr * n1n2 / determinant,
            n1xn2 = cartesianCross(n1, n2),
            A = cartesianScale(n1, c1),
            B = cartesianScale(n2, c2);
        cartesianAddInPlace(A, B);

        // Solve |p(t)|^2 = 1.
        var u = n1xn2,
            w = cartesianDot(A, u),
            uu = cartesianDot(u, u),
            t2 = w * w - uu * (cartesianDot(A, A) - 1);

        if (t2 < 0) return;

        var t = sqrt(t2),
            q = cartesianScale(u, (-w - t) / uu);
        cartesianAddInPlace(q, A);
        q = spherical(q);

        if (!two) return q;

        // Two intersection points.
        var lambda0 = a[0],
            lambda1 = b[0],
            phi0 = a[1],
            phi1 = b[1],
            z;

        if (lambda1 < lambda0) z = lambda0, lambda0 = lambda1, lambda1 = z;

        var delta = lambda1 - lambda0,
            polar = abs(delta - pi$1) < epsilon$1,
            meridian = polar || delta < epsilon$1;

        if (!polar && phi1 < phi0) z = phi0, phi0 = phi1, phi1 = z;

        // Check that the first point is between a and b.
        if (meridian
            ? polar
              ? phi0 + phi1 > 0 ^ q[1] < (abs(q[0] - lambda0) < epsilon$1 ? phi0 : phi1)
              : phi0 <= q[1] && q[1] <= phi1
            : delta > pi$1 ^ (lambda0 <= q[0] && q[0] <= lambda1)) {
          var q1 = cartesianScale(u, (-w + t) / uu);
          cartesianAddInPlace(q1, A);
          return [q, spherical(q1)];
        }
      }

      // Generates a 4-bit vector representing the location of a point relative to
      // the small circle's bounding box.
      function code(lambda, phi) {
        var r = smallRadius ? radius : pi$1 - radius,
            code = 0;
        if (lambda < -r) code |= 1; // left
        else if (lambda > r) code |= 2; // right
        if (phi < -r) code |= 4; // below
        else if (phi > r) code |= 8; // above
        return code;
      }

      return clip(visible, clipLine, interpolate, smallRadius ? [0, -radius] : [-pi$1, radius - pi$1]);
    }

    function clipLine(a, b, x0, y0, x1, y1) {
      var ax = a[0],
          ay = a[1],
          bx = b[0],
          by = b[1],
          t0 = 0,
          t1 = 1,
          dx = bx - ax,
          dy = by - ay,
          r;

      r = x0 - ax;
      if (!dx && r > 0) return;
      r /= dx;
      if (dx < 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      } else if (dx > 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      }

      r = x1 - ax;
      if (!dx && r < 0) return;
      r /= dx;
      if (dx < 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      } else if (dx > 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      }

      r = y0 - ay;
      if (!dy && r > 0) return;
      r /= dy;
      if (dy < 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      } else if (dy > 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      }

      r = y1 - ay;
      if (!dy && r < 0) return;
      r /= dy;
      if (dy < 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      } else if (dy > 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      }

      if (t0 > 0) a[0] = ax + t0 * dx, a[1] = ay + t0 * dy;
      if (t1 < 1) b[0] = ax + t1 * dx, b[1] = ay + t1 * dy;
      return true;
    }

    var clipMax = 1e9, clipMin = -clipMax;

    // TODO Use d3-polygon’s polygonContains here for the ring check?
    // TODO Eliminate duplicate buffering in clipBuffer and polygon.push?

    function clipRectangle(x0, y0, x1, y1) {

      function visible(x, y) {
        return x0 <= x && x <= x1 && y0 <= y && y <= y1;
      }

      function interpolate(from, to, direction, stream) {
        var a = 0, a1 = 0;
        if (from == null
            || (a = corner(from, direction)) !== (a1 = corner(to, direction))
            || comparePoint(from, to) < 0 ^ direction > 0) {
          do stream.point(a === 0 || a === 3 ? x0 : x1, a > 1 ? y1 : y0);
          while ((a = (a + direction + 4) % 4) !== a1);
        } else {
          stream.point(to[0], to[1]);
        }
      }

      function corner(p, direction) {
        return abs(p[0] - x0) < epsilon$1 ? direction > 0 ? 0 : 3
            : abs(p[0] - x1) < epsilon$1 ? direction > 0 ? 2 : 1
            : abs(p[1] - y0) < epsilon$1 ? direction > 0 ? 1 : 0
            : direction > 0 ? 3 : 2; // abs(p[1] - y1) < epsilon
      }

      function compareIntersection(a, b) {
        return comparePoint(a.x, b.x);
      }

      function comparePoint(a, b) {
        var ca = corner(a, 1),
            cb = corner(b, 1);
        return ca !== cb ? ca - cb
            : ca === 0 ? b[1] - a[1]
            : ca === 1 ? a[0] - b[0]
            : ca === 2 ? a[1] - b[1]
            : b[0] - a[0];
      }

      return function(stream) {
        var activeStream = stream,
            bufferStream = clipBuffer(),
            segments,
            polygon,
            ring,
            x__, y__, v__, // first point
            x_, y_, v_, // previous point
            first,
            clean;

        var clipStream = {
          point: point,
          lineStart: lineStart,
          lineEnd: lineEnd,
          polygonStart: polygonStart,
          polygonEnd: polygonEnd
        };

        function point(x, y) {
          if (visible(x, y)) activeStream.point(x, y);
        }

        function polygonInside() {
          var winding = 0;

          for (var i = 0, n = polygon.length; i < n; ++i) {
            for (var ring = polygon[i], j = 1, m = ring.length, point = ring[0], a0, a1, b0 = point[0], b1 = point[1]; j < m; ++j) {
              a0 = b0, a1 = b1, point = ring[j], b0 = point[0], b1 = point[1];
              if (a1 <= y1) { if (b1 > y1 && (b0 - a0) * (y1 - a1) > (b1 - a1) * (x0 - a0)) ++winding; }
              else { if (b1 <= y1 && (b0 - a0) * (y1 - a1) < (b1 - a1) * (x0 - a0)) --winding; }
            }
          }

          return winding;
        }

        // Buffer geometry within a polygon and then clip it en masse.
        function polygonStart() {
          activeStream = bufferStream, segments = [], polygon = [], clean = true;
        }

        function polygonEnd() {
          var startInside = polygonInside(),
              cleanInside = clean && startInside,
              visible = (segments = merge(segments)).length;
          if (cleanInside || visible) {
            stream.polygonStart();
            if (cleanInside) {
              stream.lineStart();
              interpolate(null, null, 1, stream);
              stream.lineEnd();
            }
            if (visible) {
              clipRejoin(segments, compareIntersection, startInside, interpolate, stream);
            }
            stream.polygonEnd();
          }
          activeStream = stream, segments = polygon = ring = null;
        }

        function lineStart() {
          clipStream.point = linePoint;
          if (polygon) polygon.push(ring = []);
          first = true;
          v_ = false;
          x_ = y_ = NaN;
        }

        // TODO rather than special-case polygons, simply handle them separately.
        // Ideally, coincident intersection points should be jittered to avoid
        // clipping issues.
        function lineEnd() {
          if (segments) {
            linePoint(x__, y__);
            if (v__ && v_) bufferStream.rejoin();
            segments.push(bufferStream.result());
          }
          clipStream.point = point;
          if (v_) activeStream.lineEnd();
        }

        function linePoint(x, y) {
          var v = visible(x, y);
          if (polygon) ring.push([x, y]);
          if (first) {
            x__ = x, y__ = y, v__ = v;
            first = false;
            if (v) {
              activeStream.lineStart();
              activeStream.point(x, y);
            }
          } else {
            if (v && v_) activeStream.point(x, y);
            else {
              var a = [x_ = Math.max(clipMin, Math.min(clipMax, x_)), y_ = Math.max(clipMin, Math.min(clipMax, y_))],
                  b = [x = Math.max(clipMin, Math.min(clipMax, x)), y = Math.max(clipMin, Math.min(clipMax, y))];
              if (clipLine(a, b, x0, y0, x1, y1)) {
                if (!v_) {
                  activeStream.lineStart();
                  activeStream.point(a[0], a[1]);
                }
                activeStream.point(b[0], b[1]);
                if (!v) activeStream.lineEnd();
                clean = false;
              } else if (v) {
                activeStream.lineStart();
                activeStream.point(x, y);
                clean = false;
              }
            }
          }
          x_ = x, y_ = y, v_ = v;
        }

        return clipStream;
      };
    }

    function identity$4(x) {
      return x;
    }

    var areaSum = adder(),
        areaRingSum = adder(),
        x00,
        y00,
        x0,
        y0;

    var areaStream = {
      point: noop$1,
      lineStart: noop$1,
      lineEnd: noop$1,
      polygonStart: function() {
        areaStream.lineStart = areaRingStart;
        areaStream.lineEnd = areaRingEnd;
      },
      polygonEnd: function() {
        areaStream.lineStart = areaStream.lineEnd = areaStream.point = noop$1;
        areaSum.add(abs(areaRingSum));
        areaRingSum.reset();
      },
      result: function() {
        var area = areaSum / 2;
        areaSum.reset();
        return area;
      }
    };

    function areaRingStart() {
      areaStream.point = areaPointFirst;
    }

    function areaPointFirst(x, y) {
      areaStream.point = areaPoint;
      x00 = x0 = x, y00 = y0 = y;
    }

    function areaPoint(x, y) {
      areaRingSum.add(y0 * x - x0 * y);
      x0 = x, y0 = y;
    }

    function areaRingEnd() {
      areaPoint(x00, y00);
    }

    var x0$1 = Infinity,
        y0$1 = x0$1,
        x1 = -x0$1,
        y1 = x1;

    var boundsStream = {
      point: boundsPoint,
      lineStart: noop$1,
      lineEnd: noop$1,
      polygonStart: noop$1,
      polygonEnd: noop$1,
      result: function() {
        var bounds = [[x0$1, y0$1], [x1, y1]];
        x1 = y1 = -(y0$1 = x0$1 = Infinity);
        return bounds;
      }
    };

    function boundsPoint(x, y) {
      if (x < x0$1) x0$1 = x;
      if (x > x1) x1 = x;
      if (y < y0$1) y0$1 = y;
      if (y > y1) y1 = y;
    }

    // TODO Enforce positive area for exterior, negative area for interior?

    var X0 = 0,
        Y0 = 0,
        Z0 = 0,
        X1 = 0,
        Y1 = 0,
        Z1 = 0,
        X2 = 0,
        Y2 = 0,
        Z2 = 0,
        x00$1,
        y00$1,
        x0$2,
        y0$2;

    var centroidStream = {
      point: centroidPoint,
      lineStart: centroidLineStart,
      lineEnd: centroidLineEnd,
      polygonStart: function() {
        centroidStream.lineStart = centroidRingStart;
        centroidStream.lineEnd = centroidRingEnd;
      },
      polygonEnd: function() {
        centroidStream.point = centroidPoint;
        centroidStream.lineStart = centroidLineStart;
        centroidStream.lineEnd = centroidLineEnd;
      },
      result: function() {
        var centroid = Z2 ? [X2 / Z2, Y2 / Z2]
            : Z1 ? [X1 / Z1, Y1 / Z1]
            : Z0 ? [X0 / Z0, Y0 / Z0]
            : [NaN, NaN];
        X0 = Y0 = Z0 =
        X1 = Y1 = Z1 =
        X2 = Y2 = Z2 = 0;
        return centroid;
      }
    };

    function centroidPoint(x, y) {
      X0 += x;
      Y0 += y;
      ++Z0;
    }

    function centroidLineStart() {
      centroidStream.point = centroidPointFirstLine;
    }

    function centroidPointFirstLine(x, y) {
      centroidStream.point = centroidPointLine;
      centroidPoint(x0$2 = x, y0$2 = y);
    }

    function centroidPointLine(x, y) {
      var dx = x - x0$2, dy = y - y0$2, z = sqrt(dx * dx + dy * dy);
      X1 += z * (x0$2 + x) / 2;
      Y1 += z * (y0$2 + y) / 2;
      Z1 += z;
      centroidPoint(x0$2 = x, y0$2 = y);
    }

    function centroidLineEnd() {
      centroidStream.point = centroidPoint;
    }

    function centroidRingStart() {
      centroidStream.point = centroidPointFirstRing;
    }

    function centroidRingEnd() {
      centroidPointRing(x00$1, y00$1);
    }

    function centroidPointFirstRing(x, y) {
      centroidStream.point = centroidPointRing;
      centroidPoint(x00$1 = x0$2 = x, y00$1 = y0$2 = y);
    }

    function centroidPointRing(x, y) {
      var dx = x - x0$2,
          dy = y - y0$2,
          z = sqrt(dx * dx + dy * dy);

      X1 += z * (x0$2 + x) / 2;
      Y1 += z * (y0$2 + y) / 2;
      Z1 += z;

      z = y0$2 * x - x0$2 * y;
      X2 += z * (x0$2 + x);
      Y2 += z * (y0$2 + y);
      Z2 += z * 3;
      centroidPoint(x0$2 = x, y0$2 = y);
    }

    function PathContext(context) {
      this._context = context;
    }

    PathContext.prototype = {
      _radius: 4.5,
      pointRadius: function(_) {
        return this._radius = _, this;
      },
      polygonStart: function() {
        this._line = 0;
      },
      polygonEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._point = 0;
      },
      lineEnd: function() {
        if (this._line === 0) this._context.closePath();
        this._point = NaN;
      },
      point: function(x, y) {
        switch (this._point) {
          case 0: {
            this._context.moveTo(x, y);
            this._point = 1;
            break;
          }
          case 1: {
            this._context.lineTo(x, y);
            break;
          }
          default: {
            this._context.moveTo(x + this._radius, y);
            this._context.arc(x, y, this._radius, 0, tau$1);
            break;
          }
        }
      },
      result: noop$1
    };

    var lengthSum = adder(),
        lengthRing,
        x00$2,
        y00$2,
        x0$3,
        y0$3;

    var lengthStream = {
      point: noop$1,
      lineStart: function() {
        lengthStream.point = lengthPointFirst;
      },
      lineEnd: function() {
        if (lengthRing) lengthPoint(x00$2, y00$2);
        lengthStream.point = noop$1;
      },
      polygonStart: function() {
        lengthRing = true;
      },
      polygonEnd: function() {
        lengthRing = null;
      },
      result: function() {
        var length = +lengthSum;
        lengthSum.reset();
        return length;
      }
    };

    function lengthPointFirst(x, y) {
      lengthStream.point = lengthPoint;
      x00$2 = x0$3 = x, y00$2 = y0$3 = y;
    }

    function lengthPoint(x, y) {
      x0$3 -= x, y0$3 -= y;
      lengthSum.add(sqrt(x0$3 * x0$3 + y0$3 * y0$3));
      x0$3 = x, y0$3 = y;
    }

    function PathString() {
      this._string = [];
    }

    PathString.prototype = {
      _radius: 4.5,
      _circle: circle(4.5),
      pointRadius: function(_) {
        if ((_ = +_) !== this._radius) this._radius = _, this._circle = null;
        return this;
      },
      polygonStart: function() {
        this._line = 0;
      },
      polygonEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._point = 0;
      },
      lineEnd: function() {
        if (this._line === 0) this._string.push("Z");
        this._point = NaN;
      },
      point: function(x, y) {
        switch (this._point) {
          case 0: {
            this._string.push("M", x, ",", y);
            this._point = 1;
            break;
          }
          case 1: {
            this._string.push("L", x, ",", y);
            break;
          }
          default: {
            if (this._circle == null) this._circle = circle(this._radius);
            this._string.push("M", x, ",", y, this._circle);
            break;
          }
        }
      },
      result: function() {
        if (this._string.length) {
          var result = this._string.join("");
          this._string = [];
          return result;
        } else {
          return null;
        }
      }
    };

    function circle(radius) {
      return "m0," + radius
          + "a" + radius + "," + radius + " 0 1,1 0," + -2 * radius
          + "a" + radius + "," + radius + " 0 1,1 0," + 2 * radius
          + "z";
    }

    function geoPath(projection, context) {
      var pointRadius = 4.5,
          projectionStream,
          contextStream;

      function path(object) {
        if (object) {
          if (typeof pointRadius === "function") contextStream.pointRadius(+pointRadius.apply(this, arguments));
          geoStream(object, projectionStream(contextStream));
        }
        return contextStream.result();
      }

      path.area = function(object) {
        geoStream(object, projectionStream(areaStream));
        return areaStream.result();
      };

      path.measure = function(object) {
        geoStream(object, projectionStream(lengthStream));
        return lengthStream.result();
      };

      path.bounds = function(object) {
        geoStream(object, projectionStream(boundsStream));
        return boundsStream.result();
      };

      path.centroid = function(object) {
        geoStream(object, projectionStream(centroidStream));
        return centroidStream.result();
      };

      path.projection = function(_) {
        return arguments.length ? (projectionStream = _ == null ? (projection = null, identity$4) : (projection = _).stream, path) : projection;
      };

      path.context = function(_) {
        if (!arguments.length) return context;
        contextStream = _ == null ? (context = null, new PathString) : new PathContext(context = _);
        if (typeof pointRadius !== "function") contextStream.pointRadius(pointRadius);
        return path;
      };

      path.pointRadius = function(_) {
        if (!arguments.length) return pointRadius;
        pointRadius = typeof _ === "function" ? _ : (contextStream.pointRadius(+_), +_);
        return path;
      };

      return path.projection(projection).context(context);
    }

    function transformer$1(methods) {
      return function(stream) {
        var s = new TransformStream;
        for (var key in methods) s[key] = methods[key];
        s.stream = stream;
        return s;
      };
    }

    function TransformStream() {}

    TransformStream.prototype = {
      constructor: TransformStream,
      point: function(x, y) { this.stream.point(x, y); },
      sphere: function() { this.stream.sphere(); },
      lineStart: function() { this.stream.lineStart(); },
      lineEnd: function() { this.stream.lineEnd(); },
      polygonStart: function() { this.stream.polygonStart(); },
      polygonEnd: function() { this.stream.polygonEnd(); }
    };

    function fit(projection, fitBounds, object) {
      var clip = projection.clipExtent && projection.clipExtent();
      projection.scale(150).translate([0, 0]);
      if (clip != null) projection.clipExtent(null);
      geoStream(object, projection.stream(boundsStream));
      fitBounds(boundsStream.result());
      if (clip != null) projection.clipExtent(clip);
      return projection;
    }

    function fitExtent(projection, extent, object) {
      return fit(projection, function(b) {
        var w = extent[1][0] - extent[0][0],
            h = extent[1][1] - extent[0][1],
            k = Math.min(w / (b[1][0] - b[0][0]), h / (b[1][1] - b[0][1])),
            x = +extent[0][0] + (w - k * (b[1][0] + b[0][0])) / 2,
            y = +extent[0][1] + (h - k * (b[1][1] + b[0][1])) / 2;
        projection.scale(150 * k).translate([x, y]);
      }, object);
    }

    function fitSize(projection, size, object) {
      return fitExtent(projection, [[0, 0], size], object);
    }

    function fitWidth(projection, width, object) {
      return fit(projection, function(b) {
        var w = +width,
            k = w / (b[1][0] - b[0][0]),
            x = (w - k * (b[1][0] + b[0][0])) / 2,
            y = -k * b[0][1];
        projection.scale(150 * k).translate([x, y]);
      }, object);
    }

    function fitHeight(projection, height, object) {
      return fit(projection, function(b) {
        var h = +height,
            k = h / (b[1][1] - b[0][1]),
            x = -k * b[0][0],
            y = (h - k * (b[1][1] + b[0][1])) / 2;
        projection.scale(150 * k).translate([x, y]);
      }, object);
    }

    var maxDepth = 16, // maximum depth of subdivision
        cosMinDistance = cos(30 * radians); // cos(minimum angular distance)

    function resample(project, delta2) {
      return +delta2 ? resample$1(project, delta2) : resampleNone(project);
    }

    function resampleNone(project) {
      return transformer$1({
        point: function(x, y) {
          x = project(x, y);
          this.stream.point(x[0], x[1]);
        }
      });
    }

    function resample$1(project, delta2) {

      function resampleLineTo(x0, y0, lambda0, a0, b0, c0, x1, y1, lambda1, a1, b1, c1, depth, stream) {
        var dx = x1 - x0,
            dy = y1 - y0,
            d2 = dx * dx + dy * dy;
        if (d2 > 4 * delta2 && depth--) {
          var a = a0 + a1,
              b = b0 + b1,
              c = c0 + c1,
              m = sqrt(a * a + b * b + c * c),
              phi2 = asin(c /= m),
              lambda2 = abs(abs(c) - 1) < epsilon$1 || abs(lambda0 - lambda1) < epsilon$1 ? (lambda0 + lambda1) / 2 : atan2(b, a),
              p = project(lambda2, phi2),
              x2 = p[0],
              y2 = p[1],
              dx2 = x2 - x0,
              dy2 = y2 - y0,
              dz = dy * dx2 - dx * dy2;
          if (dz * dz / d2 > delta2 // perpendicular projected distance
              || abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3 // midpoint close to an end
              || a0 * a1 + b0 * b1 + c0 * c1 < cosMinDistance) { // angular distance
            resampleLineTo(x0, y0, lambda0, a0, b0, c0, x2, y2, lambda2, a /= m, b /= m, c, depth, stream);
            stream.point(x2, y2);
            resampleLineTo(x2, y2, lambda2, a, b, c, x1, y1, lambda1, a1, b1, c1, depth, stream);
          }
        }
      }
      return function(stream) {
        var lambda00, x00, y00, a00, b00, c00, // first point
            lambda0, x0, y0, a0, b0, c0; // previous point

        var resampleStream = {
          point: point,
          lineStart: lineStart,
          lineEnd: lineEnd,
          polygonStart: function() { stream.polygonStart(); resampleStream.lineStart = ringStart; },
          polygonEnd: function() { stream.polygonEnd(); resampleStream.lineStart = lineStart; }
        };

        function point(x, y) {
          x = project(x, y);
          stream.point(x[0], x[1]);
        }

        function lineStart() {
          x0 = NaN;
          resampleStream.point = linePoint;
          stream.lineStart();
        }

        function linePoint(lambda, phi) {
          var c = cartesian([lambda, phi]), p = project(lambda, phi);
          resampleLineTo(x0, y0, lambda0, a0, b0, c0, x0 = p[0], y0 = p[1], lambda0 = lambda, a0 = c[0], b0 = c[1], c0 = c[2], maxDepth, stream);
          stream.point(x0, y0);
        }

        function lineEnd() {
          resampleStream.point = point;
          stream.lineEnd();
        }

        function ringStart() {
          lineStart();
          resampleStream.point = ringPoint;
          resampleStream.lineEnd = ringEnd;
        }

        function ringPoint(lambda, phi) {
          linePoint(lambda00 = lambda, phi), x00 = x0, y00 = y0, a00 = a0, b00 = b0, c00 = c0;
          resampleStream.point = linePoint;
        }

        function ringEnd() {
          resampleLineTo(x0, y0, lambda0, a0, b0, c0, x00, y00, lambda00, a00, b00, c00, maxDepth, stream);
          resampleStream.lineEnd = lineEnd;
          lineEnd();
        }

        return resampleStream;
      };
    }

    var transformRadians = transformer$1({
      point: function(x, y) {
        this.stream.point(x * radians, y * radians);
      }
    });

    function transformRotate(rotate) {
      return transformer$1({
        point: function(x, y) {
          var r = rotate(x, y);
          return this.stream.point(r[0], r[1]);
        }
      });
    }

    function scaleTranslate(k, dx, dy) {
      function transform(x, y) {
        return [dx + k * x, dy - k * y];
      }
      transform.invert = function(x, y) {
        return [(x - dx) / k, (dy - y) / k];
      };
      return transform;
    }

    function scaleTranslateRotate(k, dx, dy, alpha) {
      var cosAlpha = cos(alpha),
          sinAlpha = sin(alpha),
          a = cosAlpha * k,
          b = sinAlpha * k,
          ai = cosAlpha / k,
          bi = sinAlpha / k,
          ci = (sinAlpha * dy - cosAlpha * dx) / k,
          fi = (sinAlpha * dx + cosAlpha * dy) / k;
      function transform(x, y) {
        return [a * x - b * y + dx, dy - b * x - a * y];
      }
      transform.invert = function(x, y) {
        return [ai * x - bi * y + ci, fi - bi * x - ai * y];
      };
      return transform;
    }

    function projectionMutator(projectAt) {
      var project,
          k = 150, // scale
          x = 480, y = 250, // translate
          lambda = 0, phi = 0, // center
          deltaLambda = 0, deltaPhi = 0, deltaGamma = 0, rotate, // pre-rotate
          alpha = 0, // post-rotate
          theta = null, preclip = clipAntimeridian, // pre-clip angle
          x0 = null, y0, x1, y1, postclip = identity$4, // post-clip extent
          delta2 = 0.5, // precision
          projectResample,
          projectTransform,
          projectRotateTransform,
          cache,
          cacheStream;

      function projection(point) {
        return projectRotateTransform(point[0] * radians, point[1] * radians);
      }

      function invert(point) {
        point = projectRotateTransform.invert(point[0], point[1]);
        return point && [point[0] * degrees, point[1] * degrees];
      }

      projection.stream = function(stream) {
        return cache && cacheStream === stream ? cache : cache = transformRadians(transformRotate(rotate)(preclip(projectResample(postclip(cacheStream = stream)))));
      };

      projection.preclip = function(_) {
        return arguments.length ? (preclip = _, theta = undefined, reset()) : preclip;
      };

      projection.postclip = function(_) {
        return arguments.length ? (postclip = _, x0 = y0 = x1 = y1 = null, reset()) : postclip;
      };

      projection.clipAngle = function(_) {
        return arguments.length ? (preclip = +_ ? clipCircle(theta = _ * radians) : (theta = null, clipAntimeridian), reset()) : theta * degrees;
      };

      projection.clipExtent = function(_) {
        return arguments.length ? (postclip = _ == null ? (x0 = y0 = x1 = y1 = null, identity$4) : clipRectangle(x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1]), reset()) : x0 == null ? null : [[x0, y0], [x1, y1]];
      };

      projection.scale = function(_) {
        return arguments.length ? (k = +_, recenter()) : k;
      };

      projection.translate = function(_) {
        return arguments.length ? (x = +_[0], y = +_[1], recenter()) : [x, y];
      };

      projection.center = function(_) {
        return arguments.length ? (lambda = _[0] % 360 * radians, phi = _[1] % 360 * radians, recenter()) : [lambda * degrees, phi * degrees];
      };

      projection.rotate = function(_) {
        return arguments.length ? (deltaLambda = _[0] % 360 * radians, deltaPhi = _[1] % 360 * radians, deltaGamma = _.length > 2 ? _[2] % 360 * radians : 0, recenter()) : [deltaLambda * degrees, deltaPhi * degrees, deltaGamma * degrees];
      };

      projection.angle = function(_) {
        return arguments.length ? (alpha = _ % 360 * radians, recenter()) : alpha * degrees;
      };

      projection.precision = function(_) {
        return arguments.length ? (projectResample = resample(projectTransform, delta2 = _ * _), reset()) : sqrt(delta2);
      };

      projection.fitExtent = function(extent, object) {
        return fitExtent(projection, extent, object);
      };

      projection.fitSize = function(size, object) {
        return fitSize(projection, size, object);
      };

      projection.fitWidth = function(width, object) {
        return fitWidth(projection, width, object);
      };

      projection.fitHeight = function(height, object) {
        return fitHeight(projection, height, object);
      };

      function recenter() {
        var center = scaleTranslateRotate(k, 0, 0, alpha).apply(null, project(lambda, phi)),
            transform = (alpha ? scaleTranslateRotate : scaleTranslate)(k, x - center[0], y - center[1], alpha);
        rotate = rotateRadians(deltaLambda, deltaPhi, deltaGamma);
        projectTransform = compose(project, transform);
        projectRotateTransform = compose(rotate, projectTransform);
        projectResample = resample(projectTransform, delta2);
        return reset();
      }

      function reset() {
        cache = cacheStream = null;
        return projection;
      }

      return function() {
        project = projectAt.apply(this, arguments);
        projection.invert = project.invert && invert;
        return recenter();
      };
    }

    function conicProjection(projectAt) {
      var phi0 = 0,
          phi1 = pi$1 / 3,
          m = projectionMutator(projectAt),
          p = m(phi0, phi1);

      p.parallels = function(_) {
        return arguments.length ? m(phi0 = _[0] * radians, phi1 = _[1] * radians) : [phi0 * degrees, phi1 * degrees];
      };

      return p;
    }

    function cylindricalEqualAreaRaw(phi0) {
      var cosPhi0 = cos(phi0);

      function forward(lambda, phi) {
        return [lambda * cosPhi0, sin(phi) / cosPhi0];
      }

      forward.invert = function(x, y) {
        return [x / cosPhi0, asin(y * cosPhi0)];
      };

      return forward;
    }

    function conicEqualAreaRaw(y0, y1) {
      var sy0 = sin(y0), n = (sy0 + sin(y1)) / 2;

      // Are the parallels symmetrical around the Equator?
      if (abs(n) < epsilon$1) return cylindricalEqualAreaRaw(y0);

      var c = 1 + sy0 * (2 * n - sy0), r0 = sqrt(c) / n;

      function project(x, y) {
        var r = sqrt(c - 2 * n * sin(y)) / n;
        return [r * sin(x *= n), r0 - r * cos(x)];
      }

      project.invert = function(x, y) {
        var r0y = r0 - y;
        return [atan2(x, abs(r0y)) / n * sign$1(r0y), asin((c - (x * x + r0y * r0y) * n * n) / (2 * n))];
      };

      return project;
    }

    function conicEqualArea() {
      return conicProjection(conicEqualAreaRaw)
          .scale(155.424)
          .center([0, 33.6442]);
    }

    function geoAlbers() {
      return conicEqualArea()
          .parallels([29.5, 45.5])
          .scale(1070)
          .translate([480, 250])
          .rotate([96, 0])
          .center([-0.6, 38.7]);
    }

    /* src\RowChart.svelte generated by Svelte v3.16.0 */
    const file$8 = "src\\RowChart.svelte";

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[16] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[19] = list[i];
    	return child_ctx;
    }

    // (57:6) {#each mapYearDataArray as bar}
    function create_each_block_1$3(ctx) {
    	let g;
    	let rect;
    	let title;
    	let t0_value = /*bar*/ ctx[19][1].name + "";
    	let t0;
    	let t1;
    	let t2_value = /*bar*/ ctx[19][1].value + "";
    	let t2;
    	let rect_width_value;
    	let rect_x_value;
    	let rect_height_value;
    	let rect_fill_value;
    	let rect_stroke_width_value;
    	let text_1;
    	let t3_value = /*bar*/ ctx[19][1].name + "";
    	let t3;
    	let text_1_transform_value;
    	let g_transform_value;
    	let dispose;

    	function mouseenter_handler(...args) {
    		return /*mouseenter_handler*/ ctx[15](/*bar*/ ctx[19], ...args);
    	}

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			rect = svg_element("rect");
    			title = svg_element("title");
    			t0 = text(t0_value);
    			t1 = text(": ");
    			t2 = text(t2_value);
    			text_1 = svg_element("text");
    			t3 = text(t3_value);
    			add_location(title, file$8, 67, 12, 1950);
    			attr_dev(rect, "width", rect_width_value = Math.abs(/*x*/ ctx[8](/*bar*/ ctx[19][1].value) - /*x*/ ctx[8](0)));
    			attr_dev(rect, "x", rect_x_value = /*x*/ ctx[8](Math.min(/*bar*/ ctx[19][1].value, 0)));
    			attr_dev(rect, "height", rect_height_value = /*y*/ ctx[9].bandwidth());

    			attr_dev(rect, "fill", rect_fill_value = /*hovered*/ ctx[1] == /*bar*/ ctx[19][0]
    			? /*hoveredColor*/ ctx[2]
    			: /*bar*/ ctx[19][1].fill);

    			attr_dev(rect, "stroke-width", rect_stroke_width_value = /*hovered*/ ctx[1] == /*bar*/ ctx[19][0] ? 3 : 0);
    			add_location(rect, file$8, 58, 10, 1549);
    			attr_dev(text_1, "class", "yAxis svelte-12q3wj9");
    			attr_dev(text_1, "transform", text_1_transform_value = "translate(" + /*margin*/ ctx[6].left + ")");
    			attr_dev(text_1, "dy", "1em");
    			attr_dev(text_1, "dx", "-3");
    			add_location(text_1, file$8, 69, 10, 2025);
    			attr_dev(g, "transform", g_transform_value = "translate(0 " + /*y*/ ctx[9](/*bar*/ ctx[19][0]) + ")");
    			add_location(g, file$8, 57, 8, 1497);

    			dispose = [
    				listen_dev(rect, "mouseenter", mouseenter_handler, false, false, false),
    				listen_dev(rect, "mouseleave", /*handleLocationLeave*/ ctx[11], false, false, false)
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, rect);
    			append_dev(rect, title);
    			append_dev(title, t0);
    			append_dev(title, t1);
    			append_dev(title, t2);
    			append_dev(g, text_1);
    			append_dev(text_1, t3);
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*mapYearDataArray*/ 1 && t0_value !== (t0_value = /*bar*/ ctx[19][1].name + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*mapYearDataArray*/ 1 && t2_value !== (t2_value = /*bar*/ ctx[19][1].value + "")) set_data_dev(t2, t2_value);

    			if (dirty & /*x, mapYearDataArray*/ 257 && rect_width_value !== (rect_width_value = Math.abs(/*x*/ ctx[8](/*bar*/ ctx[19][1].value) - /*x*/ ctx[8](0)))) {
    				attr_dev(rect, "width", rect_width_value);
    			}

    			if (dirty & /*x, mapYearDataArray*/ 257 && rect_x_value !== (rect_x_value = /*x*/ ctx[8](Math.min(/*bar*/ ctx[19][1].value, 0)))) {
    				attr_dev(rect, "x", rect_x_value);
    			}

    			if (dirty & /*y*/ 512 && rect_height_value !== (rect_height_value = /*y*/ ctx[9].bandwidth())) {
    				attr_dev(rect, "height", rect_height_value);
    			}

    			if (dirty & /*hovered, mapYearDataArray, hoveredColor*/ 7 && rect_fill_value !== (rect_fill_value = /*hovered*/ ctx[1] == /*bar*/ ctx[19][0]
    			? /*hoveredColor*/ ctx[2]
    			: /*bar*/ ctx[19][1].fill)) {
    				attr_dev(rect, "fill", rect_fill_value);
    			}

    			if (dirty & /*hovered, mapYearDataArray*/ 3 && rect_stroke_width_value !== (rect_stroke_width_value = /*hovered*/ ctx[1] == /*bar*/ ctx[19][0] ? 3 : 0)) {
    				attr_dev(rect, "stroke-width", rect_stroke_width_value);
    			}

    			if (dirty & /*mapYearDataArray*/ 1 && t3_value !== (t3_value = /*bar*/ ctx[19][1].name + "")) set_data_dev(t3, t3_value);

    			if (dirty & /*margin*/ 64 && text_1_transform_value !== (text_1_transform_value = "translate(" + /*margin*/ ctx[6].left + ")")) {
    				attr_dev(text_1, "transform", text_1_transform_value);
    			}

    			if (dirty & /*y, mapYearDataArray*/ 513 && g_transform_value !== (g_transform_value = "translate(0 " + /*y*/ ctx[9](/*bar*/ ctx[19][0]) + ")")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$3.name,
    		type: "each",
    		source: "(57:6) {#each mapYearDataArray as bar}",
    		ctx
    	});

    	return block;
    }

    // (81:8) {#each x.ticks(5) as tick}
    function create_each_block$4(ctx) {
    	let g;
    	let line;
    	let text_1;
    	let t_value = /*tickFormat*/ ctx[5](/*tick*/ ctx[16]) + "";
    	let t;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			attr_dev(line, "y1", "0");
    			attr_dev(line, "y2", /*height*/ ctx[7]);
    			attr_dev(line, "stroke", "#fff");
    			add_location(line, file$8, 82, 12, 2387);
    			attr_dev(text_1, "class", "anchor-middle svelte-12q3wj9");
    			attr_dev(text_1, "dy", "-5");
    			add_location(text_1, file$8, 83, 12, 2442);
    			attr_dev(g, "transform", g_transform_value = "translate(" + /*x*/ ctx[8](/*tick*/ ctx[16]) + " 0)");
    			add_location(g, file$8, 81, 10, 2335);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, line);
    			append_dev(g, text_1);
    			append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*height*/ 128) {
    				attr_dev(line, "y2", /*height*/ ctx[7]);
    			}

    			if (dirty & /*tickFormat, x*/ 288 && t_value !== (t_value = /*tickFormat*/ ctx[5](/*tick*/ ctx[16]) + "")) set_data_dev(t, t_value);

    			if (dirty & /*x*/ 256 && g_transform_value !== (g_transform_value = "translate(" + /*x*/ ctx[8](/*tick*/ ctx[16]) + " 0)")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$4.name,
    		type: "each",
    		source: "(81:8) {#each x.ticks(5) as tick}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let svg;
    	let g2;
    	let text_1;

    	let t_value = (/*calculation*/ ctx[4] === "percentage"
    	? "Percentage Shortage/Surplus"
    	: /*rateOrTotal*/ ctx[3]) + "";

    	let t;
    	let text_1_transform_value;
    	let g1;
    	let g0;
    	let g0_transform_value;
    	let svg_viewBox_value;
    	let each_value_1 = /*mapYearDataArray*/ ctx[0];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$3(get_each_context_1$3(ctx, each_value_1, i));
    	}

    	let each_value = /*x*/ ctx[8].ticks(5);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			g2 = svg_element("g");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			g1 = svg_element("g");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			g0 = svg_element("g");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(text_1, "class", "anchor-middle svelte-12q3wj9");
    			attr_dev(text_1, "transform", text_1_transform_value = "translate(" + (/*margin*/ ctx[6].left + (width$2 - /*margin*/ ctx[6].left - /*margin*/ ctx[6].right) / 2) + "\r\n      10)");
    			add_location(text_1, file$8, 45, 4, 1177);
    			attr_dev(g0, "transform", g0_transform_value = "translate(0 " + /*margin*/ ctx[6].top + ")");
    			add_location(g0, file$8, 79, 6, 2246);
    			add_location(g1, file$8, 55, 4, 1445);
    			add_location(g2, file$8, 44, 2, 1168);
    			attr_dev(svg, "id", "row-chart-svg");
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + width$2 + " " + /*height*/ ctx[7]);
    			attr_dev(svg, "class", "svelte-12q3wj9");
    			add_location(svg, file$8, 43, 0, 1109);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, g2);
    			append_dev(g2, text_1);
    			append_dev(text_1, t);
    			append_dev(g2, g1);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(g1, null);
    			}

    			append_dev(g1, g0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g0, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*calculation, rateOrTotal*/ 24 && t_value !== (t_value = (/*calculation*/ ctx[4] === "percentage"
    			? "Percentage Shortage/Surplus"
    			: /*rateOrTotal*/ ctx[3]) + "")) set_data_dev(t, t_value);

    			if (dirty & /*margin*/ 64 && text_1_transform_value !== (text_1_transform_value = "translate(" + (/*margin*/ ctx[6].left + (width$2 - /*margin*/ ctx[6].left - /*margin*/ ctx[6].right) / 2) + "\r\n      10)")) {
    				attr_dev(text_1, "transform", text_1_transform_value);
    			}

    			if (dirty & /*y, mapYearDataArray, margin, Math, x, hovered, hoveredColor, handleLocationHover, handleLocationLeave*/ 3911) {
    				each_value_1 = /*mapYearDataArray*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$3(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1$3(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(g1, g0);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*x, tickFormat, height*/ 416) {
    				each_value = /*x*/ ctx[8].ticks(5);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(g0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*margin*/ 64 && g0_transform_value !== (g0_transform_value = "translate(0 " + /*margin*/ ctx[6].top + ")")) {
    				attr_dev(g0, "transform", g0_transform_value);
    			}

    			if (dirty & /*height*/ 128 && svg_viewBox_value !== (svg_viewBox_value = "0 0 " + width$2 + " " + /*height*/ ctx[7])) {
    				attr_dev(svg, "viewBox", svg_viewBox_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const width$2 = 320;

    function instance$8($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { mapYearDataArray } = $$props;
    	let { valueExtentAllTime } = $$props;
    	let { locationType } = $$props;
    	let { hovered } = $$props;
    	let { hoveredColor } = $$props;
    	let { rateOrTotal } = $$props;
    	let { calculation } = $$props;
    	let { tickFormat = t => t.toLocaleString() } = $$props;

    	function handleLocationHover(id) {
    		dispatch("locationHover", id);
    	}

    	function handleLocationLeave(id) {
    		dispatch("locationLeave");
    	}

    	const writable_props = [
    		"mapYearDataArray",
    		"valueExtentAllTime",
    		"locationType",
    		"hovered",
    		"hoveredColor",
    		"rateOrTotal",
    		"calculation",
    		"tickFormat"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<RowChart> was created with unknown prop '${key}'`);
    	});

    	const mouseenter_handler = bar => handleLocationHover(bar[0]);

    	$$self.$set = $$props => {
    		if ("mapYearDataArray" in $$props) $$invalidate(0, mapYearDataArray = $$props.mapYearDataArray);
    		if ("valueExtentAllTime" in $$props) $$invalidate(12, valueExtentAllTime = $$props.valueExtentAllTime);
    		if ("locationType" in $$props) $$invalidate(13, locationType = $$props.locationType);
    		if ("hovered" in $$props) $$invalidate(1, hovered = $$props.hovered);
    		if ("hoveredColor" in $$props) $$invalidate(2, hoveredColor = $$props.hoveredColor);
    		if ("rateOrTotal" in $$props) $$invalidate(3, rateOrTotal = $$props.rateOrTotal);
    		if ("calculation" in $$props) $$invalidate(4, calculation = $$props.calculation);
    		if ("tickFormat" in $$props) $$invalidate(5, tickFormat = $$props.tickFormat);
    	};

    	$$self.$capture_state = () => {
    		return {
    			mapYearDataArray,
    			valueExtentAllTime,
    			locationType,
    			hovered,
    			hoveredColor,
    			rateOrTotal,
    			calculation,
    			tickFormat,
    			margin,
    			height,
    			x,
    			y
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("mapYearDataArray" in $$props) $$invalidate(0, mapYearDataArray = $$props.mapYearDataArray);
    		if ("valueExtentAllTime" in $$props) $$invalidate(12, valueExtentAllTime = $$props.valueExtentAllTime);
    		if ("locationType" in $$props) $$invalidate(13, locationType = $$props.locationType);
    		if ("hovered" in $$props) $$invalidate(1, hovered = $$props.hovered);
    		if ("hoveredColor" in $$props) $$invalidate(2, hoveredColor = $$props.hoveredColor);
    		if ("rateOrTotal" in $$props) $$invalidate(3, rateOrTotal = $$props.rateOrTotal);
    		if ("calculation" in $$props) $$invalidate(4, calculation = $$props.calculation);
    		if ("tickFormat" in $$props) $$invalidate(5, tickFormat = $$props.tickFormat);
    		if ("margin" in $$props) $$invalidate(6, margin = $$props.margin);
    		if ("height" in $$props) $$invalidate(7, height = $$props.height);
    		if ("x" in $$props) $$invalidate(8, x = $$props.x);
    		if ("y" in $$props) $$invalidate(9, y = $$props.y);
    	};

    	let margin;
    	let height;
    	let x;
    	let y;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*locationType*/ 8192) {
    			 $$invalidate(6, margin = {
    				top: 30,
    				right: 10,
    				bottom: 10,
    				left: locationType == "Medicaid Region" ? 155 : 110
    			});
    		}

    		if ($$self.$$.dirty & /*mapYearDataArray, margin*/ 65) {
    			 $$invalidate(7, height = mapYearDataArray.length * 20 + margin.top + margin.bottom);
    		}

    		if ($$self.$$.dirty & /*valueExtentAllTime, margin*/ 4160) {
    			 $$invalidate(8, x = linear$1().domain(valueExtentAllTime).range([margin.left, width$2 - margin.right]));
    		}

    		if ($$self.$$.dirty & /*mapYearDataArray, margin, height*/ 193) {
    			 $$invalidate(9, y = band().domain(mapYearDataArray.map(d => d[0])).range([margin.top, height - margin.bottom]).paddingInner(0.1));
    		}
    	};

    	return [
    		mapYearDataArray,
    		hovered,
    		hoveredColor,
    		rateOrTotal,
    		calculation,
    		tickFormat,
    		margin,
    		height,
    		x,
    		y,
    		handleLocationHover,
    		handleLocationLeave,
    		valueExtentAllTime,
    		locationType,
    		dispatch,
    		mouseenter_handler
    	];
    }

    class RowChart extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {
    			mapYearDataArray: 0,
    			valueExtentAllTime: 12,
    			locationType: 13,
    			hovered: 1,
    			hoveredColor: 2,
    			rateOrTotal: 3,
    			calculation: 4,
    			tickFormat: 5
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "RowChart",
    			options,
    			id: create_fragment$8.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*mapYearDataArray*/ ctx[0] === undefined && !("mapYearDataArray" in props)) {
    			console.warn("<RowChart> was created without expected prop 'mapYearDataArray'");
    		}

    		if (/*valueExtentAllTime*/ ctx[12] === undefined && !("valueExtentAllTime" in props)) {
    			console.warn("<RowChart> was created without expected prop 'valueExtentAllTime'");
    		}

    		if (/*locationType*/ ctx[13] === undefined && !("locationType" in props)) {
    			console.warn("<RowChart> was created without expected prop 'locationType'");
    		}

    		if (/*hovered*/ ctx[1] === undefined && !("hovered" in props)) {
    			console.warn("<RowChart> was created without expected prop 'hovered'");
    		}

    		if (/*hoveredColor*/ ctx[2] === undefined && !("hoveredColor" in props)) {
    			console.warn("<RowChart> was created without expected prop 'hoveredColor'");
    		}

    		if (/*rateOrTotal*/ ctx[3] === undefined && !("rateOrTotal" in props)) {
    			console.warn("<RowChart> was created without expected prop 'rateOrTotal'");
    		}

    		if (/*calculation*/ ctx[4] === undefined && !("calculation" in props)) {
    			console.warn("<RowChart> was created without expected prop 'calculation'");
    		}
    	}

    	get mapYearDataArray() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set mapYearDataArray(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get valueExtentAllTime() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set valueExtentAllTime(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get locationType() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set locationType(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hovered() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hovered(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hoveredColor() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hoveredColor(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get rateOrTotal() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rateOrTotal(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get calculation() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set calculation(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get tickFormat() {
    		throw new Error("<RowChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tickFormat(value) {
    		throw new Error("<RowChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\MapTable.svelte generated by Svelte v3.16.0 */
    const file$9 = "src\\MapTable.svelte";

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[27] = list[i];
    	return child_ctx;
    }

    function get_each_context_2$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[33] = list[i];
    	child_ctx[32] = i;
    	return child_ctx;
    }

    function get_each_context_1$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[30] = list[i];
    	child_ctx[32] = i;
    	return child_ctx;
    }

    function get_each_context_3$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[35] = list[i];
    	return child_ctx;
    }

    // (237:0) {:else}
    function create_else_block$2(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Choose a combination of selections and click \"Show\" to see a table of the\r\n    model's projections.";
    			attr_dev(div, "class", "notification");
    			add_location(div, file$9, 237, 2, 6851);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(237:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (133:0) {#if data.values}
    function create_if_block$2(ctx) {
    	let div1;
    	let t0;
    	let div0;
    	let table;
    	let thead;
    	let tr0;
    	let th0;
    	let t1;
    	let tr1;
    	let th1;
    	let t2_value = /*params*/ ctx[5]["locationType"] + "";
    	let t2;
    	let t3;
    	let t4;
    	let tbody;
    	let t5;
    	let if_block0 = /*showTitle*/ ctx[1] && create_if_block_2$2(ctx);
    	let each_value_3 = /*grouped*/ ctx[7][0][1];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks_1[i] = create_each_block_3$2(get_each_context_3$2(ctx, each_value_3, i));
    	}

    	let each_value_1 = /*currentRows*/ ctx[10];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$4(get_each_context_1$4(ctx, each_value_1, i));
    	}

    	let if_block1 = /*numOfPages*/ ctx[9] > 1 && create_if_block_1$2(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div0 = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr0 = element("tr");
    			th0 = element("th");
    			t1 = space();
    			tr1 = element("tr");
    			th1 = element("th");
    			t2 = text(t2_value);
    			t3 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t4 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t5 = space();
    			if (if_block1) if_block1.c();
    			attr_dev(th0, "class", " frozen projection-header svelte-i3qtfk");
    			set_style(th0, "width", /*frozenWidth*/ ctx[4]);
    			add_location(th0, file$9, 160, 12, 4224);
    			add_location(tr0, file$9, 159, 10, 4206);
    			attr_dev(th1, "class", "frozen svelte-i3qtfk");
    			set_style(th1, "left", /*leftCoord*/ ctx[2] + "px");
    			set_style(th1, "padding-bottom", "5px");
    			set_style(th1, "width", /*frozenWidth*/ ctx[4]);
    			add_location(th1, file$9, 171, 12, 4613);
    			add_location(tr1, file$9, 170, 10, 4595);
    			add_location(thead, file$9, 158, 8, 4187);
    			add_location(tbody, file$9, 184, 8, 5005);
    			attr_dev(table, "class", "table is-narrow");
    			add_location(table, file$9, 157, 6, 4146);
    			attr_dev(div0, "class", "table-container svelte-i3qtfk");
    			attr_dev(div0, "id", "wrapper");
    			set_style(div0, "margin-left", /*frozenWidth*/ ctx[4]);
    			add_location(div0, file$9, 152, 4, 4034);
    			attr_dev(div1, "id", "top-level-table-div");
    			add_location(div1, file$9, 133, 2, 3503);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			if (if_block0) if_block0.m(div1, null);
    			append_dev(div1, t0);
    			append_dev(div1, div0);
    			append_dev(div0, table);
    			append_dev(table, thead);
    			append_dev(thead, tr0);
    			append_dev(tr0, th0);
    			append_dev(thead, t1);
    			append_dev(thead, tr1);
    			append_dev(tr1, th1);
    			append_dev(th1, t2);
    			append_dev(tr1, t3);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(tr1, null);
    			}

    			append_dev(table, t4);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			append_dev(div1, t5);
    			if (if_block1) if_block1.m(div1, null);
    		},
    		p: function update(ctx, dirty) {
    			if (/*showTitle*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_2$2(ctx);
    					if_block0.c();
    					if_block0.m(div1, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty[0] & /*frozenWidth*/ 16) {
    				set_style(th0, "width", /*frozenWidth*/ ctx[4]);
    			}

    			if (dirty[0] & /*params*/ 32 && t2_value !== (t2_value = /*params*/ ctx[5]["locationType"] + "")) set_data_dev(t2, t2_value);

    			if (dirty[0] & /*leftCoord*/ 4) {
    				set_style(th1, "left", /*leftCoord*/ ctx[2] + "px");
    			}

    			if (dirty[0] & /*frozenWidth*/ 16) {
    				set_style(th1, "width", /*frozenWidth*/ ctx[4]);
    			}

    			if (dirty[0] & /*grouped*/ 128) {
    				each_value_3 = /*grouped*/ ctx[7][0][1];
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3$2(ctx, each_value_3, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_3$2(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(tr1, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_3.length;
    			}

    			if (dirty[0] & /*currentRows, calculateBackgroundColor, handleLocationHover, handleLocationLeave, currentNumberFormat, frozenWidth, leftCoord*/ 13652) {
    				each_value_1 = /*currentRows*/ ctx[10];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$4(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty[0] & /*frozenWidth*/ 16) {
    				set_style(div0, "margin-left", /*frozenWidth*/ ctx[4]);
    			}

    			if (/*numOfPages*/ ctx[9] > 1) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_1$2(ctx);
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (if_block0) if_block0.d();
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    			if (if_block1) if_block1.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(133:0) {#if data.values}",
    		ctx
    	});

    	return block;
    }

    // (135:4) {#if showTitle}
    function create_if_block_2$2(ctx) {
    	let h1;
    	let t0_value = /*params*/ ctx[5]["type"] + "";
    	let t0;
    	let t1;
    	let t2_value = /*params*/ ctx[5]["locationType"].trim() + "";
    	let t2;
    	let t3;
    	let t4;
    	let h2;

    	let t5_value = permute(/*params*/ ctx[5], [
    		.../*data*/ ctx[0].params.filter(func$1).map(func_1$1),
    		"setting",
    		"education",
    		"fteOrHeadcount",
    		"rateOrTotal",
    		"calculation"
    	]).join(", ") + "";

    	let t5;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t0 = text(t0_value);
    			t1 = text("s by ");
    			t2 = text(t2_value);
    			t3 = text(", North Carolina");
    			t4 = space();
    			h2 = element("h2");
    			t5 = text(t5_value);
    			attr_dev(h1, "class", "title is-4");
    			add_location(h1, file$9, 135, 6, 3562);
    			attr_dev(h2, "class", "subtitle is-6");
    			add_location(h2, file$9, 138, 6, 3684);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t0);
    			append_dev(h1, t1);
    			append_dev(h1, t2);
    			append_dev(h1, t3);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, h2, anchor);
    			append_dev(h2, t5);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*params*/ 32 && t0_value !== (t0_value = /*params*/ ctx[5]["type"] + "")) set_data_dev(t0, t0_value);
    			if (dirty[0] & /*params*/ 32 && t2_value !== (t2_value = /*params*/ ctx[5]["locationType"].trim() + "")) set_data_dev(t2, t2_value);

    			if (dirty[0] & /*params, data*/ 33 && t5_value !== (t5_value = permute(/*params*/ ctx[5], [
    				.../*data*/ ctx[0].params.filter(func$1).map(func_1$1),
    				"setting",
    				"education",
    				"fteOrHeadcount",
    				"rateOrTotal",
    				"calculation"
    			]).join(", ") + "")) set_data_dev(t5, t5_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(h2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(135:4) {#if showTitle}",
    		ctx
    	});

    	return block;
    }

    // (178:12) {#each grouped[0][1] as year}
    function create_each_block_3$2(ctx) {
    	let th;
    	let t0_value = /*year*/ ctx[35].year + "";
    	let t0;
    	let t1;
    	let th_id_value;

    	const block = {
    		c: function create() {
    			th = element("th");
    			t0 = text(t0_value);
    			t1 = space();
    			attr_dev(th, "id", th_id_value = "header-" + /*year*/ ctx[35].year);
    			attr_dev(th, "class", "svelte-i3qtfk");
    			add_location(th, file$9, 178, 14, 4861);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, th, anchor);
    			append_dev(th, t0);
    			append_dev(th, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*grouped*/ 128 && t0_value !== (t0_value = /*year*/ ctx[35].year + "")) set_data_dev(t0, t0_value);

    			if (dirty[0] & /*grouped*/ 128 && th_id_value !== (th_id_value = "header-" + /*year*/ ctx[35].year)) {
    				attr_dev(th, "id", th_id_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(th);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3$2.name,
    		type: "each",
    		source: "(178:12) {#each grouped[0][1] as year}",
    		ctx
    	});

    	return block;
    }

    // (198:14) {#each row[1] as cell, index}
    function create_each_block_2$3(ctx) {
    	let td;
    	let t_value = /*currentNumberFormat*/ ctx[6](/*cell*/ ctx[33].value) + "";
    	let t;
    	let dispose;

    	function mouseenter_handler(...args) {
    		return /*mouseenter_handler*/ ctx[26](/*cell*/ ctx[33], ...args);
    	}

    	const block = {
    		c: function create() {
    			td = element("td");
    			t = text(t_value);
    			attr_dev(td, "class", "number-cell svelte-i3qtfk");
    			set_style(td, "background-color", /*calculateBackgroundColor*/ ctx[8](/*index*/ ctx[32], /*cell*/ ctx[33]));
    			set_style(td, "color", fontColor(/*calculateBackgroundColor*/ ctx[8](/*index*/ ctx[32], /*cell*/ ctx[33])));
    			add_location(td, file$9, 198, 16, 5603);

    			dispose = [
    				listen_dev(td, "mouseenter", mouseenter_handler, false, false, false),
    				listen_dev(td, "mouseleave", /*handleLocationLeave*/ ctx[13], false, false, false)
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, t);
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*currentNumberFormat, currentRows*/ 1088 && t_value !== (t_value = /*currentNumberFormat*/ ctx[6](/*cell*/ ctx[33].value) + "")) set_data_dev(t, t_value);

    			if (dirty[0] & /*calculateBackgroundColor, currentRows*/ 1280) {
    				set_style(td, "background-color", /*calculateBackgroundColor*/ ctx[8](/*index*/ ctx[32], /*cell*/ ctx[33]));
    			}

    			if (dirty[0] & /*calculateBackgroundColor, currentRows*/ 1280) {
    				set_style(td, "color", fontColor(/*calculateBackgroundColor*/ ctx[8](/*index*/ ctx[32], /*cell*/ ctx[33])));
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2$3.name,
    		type: "each",
    		source: "(198:14) {#each row[1] as cell, index}",
    		ctx
    	});

    	return block;
    }

    // (186:10) {#each currentRows as row, index}
    function create_each_block_1$4(ctx) {
    	let tr;
    	let td;
    	let t0_value = /*row*/ ctx[30][0] + "";
    	let t0;
    	let td_style_value;
    	let t1;
    	let t2;
    	let each_value_2 = /*row*/ ctx[30][1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2$3(get_each_context_2$3(ctx, each_value_2, i));
    	}

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td = element("td");
    			t0 = text(t0_value);
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			attr_dev(td, "class", "frozen svelte-i3qtfk");
    			attr_dev(td, "style", td_style_value = "width:" + /*frozenWidth*/ ctx[4] + ";left:" + /*leftCoord*/ ctx[2] + "px;" + (/*index*/ ctx[32] == 0 ? `padding-bottom:5px;` : ""));
    			add_location(td, file$9, 189, 14, 5297);
    			add_location(tr, file$9, 186, 12, 5071);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td);
    			append_dev(td, t0);
    			append_dev(tr, t1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tr, null);
    			}

    			append_dev(tr, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*currentRows*/ 1024 && t0_value !== (t0_value = /*row*/ ctx[30][0] + "")) set_data_dev(t0, t0_value);

    			if (dirty[0] & /*frozenWidth, leftCoord*/ 20 && td_style_value !== (td_style_value = "width:" + /*frozenWidth*/ ctx[4] + ";left:" + /*leftCoord*/ ctx[2] + "px;" + (/*index*/ ctx[32] == 0 ? `padding-bottom:5px;` : ""))) {
    				attr_dev(td, "style", td_style_value);
    			}

    			if (dirty[0] & /*calculateBackgroundColor, currentRows, handleLocationHover, handleLocationLeave, currentNumberFormat*/ 13632) {
    				each_value_2 = /*row*/ ctx[30][1];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2$3(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tr, t2);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$4.name,
    		type: "each",
    		source: "(186:10) {#each currentRows as row, index}",
    		ctx
    	});

    	return block;
    }

    // (217:4) {#if numOfPages > 1}
    function create_if_block_1$2(ctx) {
    	let nav;
    	let ul;
    	let each_value = Array.from({ length: /*numOfPages*/ ctx[9] }, func_2$1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			nav = element("nav");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(ul, "class", "pagination-list");
    			add_location(ul, file$9, 218, 8, 6313);
    			attr_dev(nav, "class", "pagination");
    			attr_dev(nav, "role", "navigation");
    			attr_dev(nav, "aria-label", "pagination");
    			add_location(nav, file$9, 217, 6, 6237);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, nav, anchor);
    			append_dev(nav, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*currentPage, numOfPages, jumpToPage*/ 2568) {
    				each_value = Array.from({ length: /*numOfPages*/ ctx[9] }, func_2$1);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(nav);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(217:4) {#if numOfPages > 1}",
    		ctx
    	});

    	return block;
    }

    // (220:10) {#each Array.from({ length: numOfPages }, (_, i) => i + 1) as pageNum}
    function create_each_block$5(ctx) {
    	let li;
    	let button;
    	let t0_value = /*pageNum*/ ctx[27] + "";
    	let t0;
    	let button_class_value;
    	let button_aria_label_value;
    	let t1;
    	let dispose;

    	const block = {
    		c: function create() {
    			li = element("li");
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = space();

    			attr_dev(button, "class", button_class_value = "pagination-link " + (/*currentPage*/ ctx[3] + 1 == /*pageNum*/ ctx[27]
    			? "is-current"
    			: ""));

    			attr_dev(button, "aria-label", button_aria_label_value = "Goto page " + /*pageNum*/ ctx[27]);
    			add_location(button, file$9, 221, 14, 6457);
    			add_location(li, file$9, 220, 12, 6437);
    			dispose = listen_dev(button, "click", /*jumpToPage*/ ctx[11], false, false, false);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, button);
    			append_dev(button, t0);
    			append_dev(li, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*numOfPages*/ 512 && t0_value !== (t0_value = /*pageNum*/ ctx[27] + "")) set_data_dev(t0, t0_value);

    			if (dirty[0] & /*currentPage, numOfPages*/ 520 && button_class_value !== (button_class_value = "pagination-link " + (/*currentPage*/ ctx[3] + 1 == /*pageNum*/ ctx[27]
    			? "is-current"
    			: ""))) {
    				attr_dev(button, "class", button_class_value);
    			}

    			if (dirty[0] & /*numOfPages*/ 512 && button_aria_label_value !== (button_aria_label_value = "Goto page " + /*pageNum*/ ctx[27])) {
    				attr_dev(button, "aria-label", button_aria_label_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$5.name,
    		type: "each",
    		source: "(220:10) {#each Array.from({ length: numOfPages }, (_, i) => i + 1) as pageNum}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*data*/ ctx[0].values) return create_if_block$2;
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const numberPerPage = 10;
    const func$1 = d => d[0].includes("Scenario");
    const func_1$1 = d => d[0];
    const func_2$1 = (_, i) => i + 1;

    function instance$9($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	const locationNamesMap = new Map(options.get("location").options.map(d => [d.value, d.label]));
    	let { data } = $$props;
    	let { showTitle = true } = $$props;
    	let { currentYear } = $$props;
    	let { baseYearOrder } = $$props;
    	let { hovered } = $$props;
    	let { hoveredColor } = $$props;
    	let { colorScale = d => "#fff" } = $$props;
    	let { valueFormat = d => d.toLocaleFormat() } = $$props;
    	let leftCoord = 0;
    	let currentPage = 0;

    	function jumpToPage(e) {
    		$$invalidate(3, currentPage = +e.target.innerText - 1);
    	}

    	function calculatePosition() {
    		const { left: containerLeft } = document.getElementById("main-container").getBoundingClientRect();
    		const { left: tableLeft } = document.getElementById("top-level-table-div").getBoundingClientRect();
    		$$invalidate(2, leftCoord = tableLeft - containerLeft);
    	}

    	function handleLocationHover(id) {
    		dispatch("locationHover", id);
    	}

    	function handleLocationLeave(id) {
    		dispatch("locationLeave");
    	}

    	onMount(() => {
    		calculatePosition();
    		window.onresize = throttle(calculatePosition, 100);
    	});

    	onDestroy(() => {
    		window.onresize = null;
    	});

    	const writable_props = [
    		"data",
    		"showTitle",
    		"currentYear",
    		"baseYearOrder",
    		"hovered",
    		"hoveredColor",
    		"colorScale",
    		"valueFormat"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<MapTable> was created with unknown prop '${key}'`);
    	});

    	const mouseenter_handler = cell => handleLocationHover(cell.location);

    	$$self.$set = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("showTitle" in $$props) $$invalidate(1, showTitle = $$props.showTitle);
    		if ("currentYear" in $$props) $$invalidate(14, currentYear = $$props.currentYear);
    		if ("baseYearOrder" in $$props) $$invalidate(15, baseYearOrder = $$props.baseYearOrder);
    		if ("hovered" in $$props) $$invalidate(16, hovered = $$props.hovered);
    		if ("hoveredColor" in $$props) $$invalidate(17, hoveredColor = $$props.hoveredColor);
    		if ("colorScale" in $$props) $$invalidate(18, colorScale = $$props.colorScale);
    		if ("valueFormat" in $$props) $$invalidate(19, valueFormat = $$props.valueFormat);
    	};

    	$$self.$capture_state = () => {
    		return {
    			data,
    			showTitle,
    			currentYear,
    			baseYearOrder,
    			hovered,
    			hoveredColor,
    			colorScale,
    			valueFormat,
    			leftCoord,
    			currentPage,
    			frozenWidth,
    			params,
    			paramsMap,
    			currentNumberFormat,
    			groupedMap,
    			grouped,
    			calculateBackgroundColor,
    			numOfPages,
    			paged,
    			currentRows
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("showTitle" in $$props) $$invalidate(1, showTitle = $$props.showTitle);
    		if ("currentYear" in $$props) $$invalidate(14, currentYear = $$props.currentYear);
    		if ("baseYearOrder" in $$props) $$invalidate(15, baseYearOrder = $$props.baseYearOrder);
    		if ("hovered" in $$props) $$invalidate(16, hovered = $$props.hovered);
    		if ("hoveredColor" in $$props) $$invalidate(17, hoveredColor = $$props.hoveredColor);
    		if ("colorScale" in $$props) $$invalidate(18, colorScale = $$props.colorScale);
    		if ("valueFormat" in $$props) $$invalidate(19, valueFormat = $$props.valueFormat);
    		if ("leftCoord" in $$props) $$invalidate(2, leftCoord = $$props.leftCoord);
    		if ("currentPage" in $$props) $$invalidate(3, currentPage = $$props.currentPage);
    		if ("frozenWidth" in $$props) $$invalidate(4, frozenWidth = $$props.frozenWidth);
    		if ("params" in $$props) $$invalidate(5, params = $$props.params);
    		if ("paramsMap" in $$props) paramsMap = $$props.paramsMap;
    		if ("currentNumberFormat" in $$props) $$invalidate(6, currentNumberFormat = $$props.currentNumberFormat);
    		if ("groupedMap" in $$props) $$invalidate(21, groupedMap = $$props.groupedMap);
    		if ("grouped" in $$props) $$invalidate(7, grouped = $$props.grouped);
    		if ("calculateBackgroundColor" in $$props) $$invalidate(8, calculateBackgroundColor = $$props.calculateBackgroundColor);
    		if ("numOfPages" in $$props) $$invalidate(9, numOfPages = $$props.numOfPages);
    		if ("paged" in $$props) $$invalidate(22, paged = $$props.paged);
    		if ("currentRows" in $$props) $$invalidate(10, currentRows = $$props.currentRows);
    	};

    	let frozenWidth;
    	let params;
    	let paramsMap;
    	let currentNumberFormat;
    	let groupedMap;
    	let grouped;
    	let calculateBackgroundColor;
    	let numOfPages;
    	let paged;
    	let currentRows;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 $$invalidate(5, params = data.params
    			? data.params.reduce(
    					(acc, curr) => {
    						acc[curr[0]] = options.get(curr[0]).options.find(d => d.value == curr[1]).label;
    						return acc;
    					},
    					{}
    				)
    			: {});
    		}

    		if ($$self.$$.dirty[0] & /*params*/ 32) {
    			 $$invalidate(4, frozenWidth = params["locationType"] == "Medicaid Region"
    			? "13.5em"
    			: "8em");
    		}

    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 if (data) {
    				$$invalidate(3, currentPage = 0);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 paramsMap = data.params
    			? new Map(data.params.map(d => [d.name, d]))
    			: undefined;
    		}

    		if ($$self.$$.dirty[0] & /*data, valueFormat*/ 524289) {
    			 $$invalidate(6, currentNumberFormat = function (d) {
    				if (data.params.find(d => d[0] == "calculation")[1] === "percentage") {
    					return valueFormat(d);
    				} else {
    					return numberFormat(+data.params.find(d => d[0] == "rateOrTotal")[1])(d);
    				}
    			});
    		}

    		if ($$self.$$.dirty[0] & /*data*/ 1) {
    			 $$invalidate(21, groupedMap = group(data.values, d => d.location));
    		}

    		if ($$self.$$.dirty[0] & /*baseYearOrder, groupedMap*/ 2129920) {
    			 $$invalidate(7, grouped = baseYearOrder.map(d => groupedMap.get(d)).map(function (d) {
    				return [
    					locationNamesMap.get(d[0].location),
    					d.sort((a, b) => ascending(a.year, b.year))
    				];
    			}));
    		}

    		if ($$self.$$.dirty[0] & /*currentYear, hovered, hoveredColor, colorScale*/ 475136) {
    			 $$invalidate(8, calculateBackgroundColor = (index, cell) => {
    				return cell.year != currentYear
    				? "#ffffff"
    				: hovered == cell.location
    					? hoveredColor
    					: colorScale(cell.location);
    			});
    		}

    		if ($$self.$$.dirty[0] & /*grouped*/ 128) {
    			 $$invalidate(9, numOfPages = Math.ceil(grouped.length / numberPerPage));
    		}

    		if ($$self.$$.dirty[0] & /*grouped*/ 128) {
    			 $$invalidate(22, paged = group(grouped, (d, i) => Math.floor(i / numberPerPage)));
    		}

    		if ($$self.$$.dirty[0] & /*paged, currentPage*/ 4194312) {
    			 $$invalidate(10, currentRows = paged.get(currentPage));
    		}

    		if ($$self.$$.dirty[0] & /*currentYear*/ 16384) {
    			 if (currentYear) {
    				const currentEl = document.getElementById(`header-${currentYear}`);
    				if (currentEl) currentEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    			}
    		}
    	};

    	return [
    		data,
    		showTitle,
    		leftCoord,
    		currentPage,
    		frozenWidth,
    		params,
    		currentNumberFormat,
    		grouped,
    		calculateBackgroundColor,
    		numOfPages,
    		currentRows,
    		jumpToPage,
    		handleLocationHover,
    		handleLocationLeave,
    		currentYear,
    		baseYearOrder,
    		hovered,
    		hoveredColor,
    		colorScale,
    		valueFormat,
    		paramsMap,
    		groupedMap,
    		paged,
    		dispatch,
    		locationNamesMap,
    		calculatePosition,
    		mouseenter_handler
    	];
    }

    class MapTable extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$9,
    			create_fragment$9,
    			safe_not_equal,
    			{
    				data: 0,
    				showTitle: 1,
    				currentYear: 14,
    				baseYearOrder: 15,
    				hovered: 16,
    				hoveredColor: 17,
    				colorScale: 18,
    				valueFormat: 19
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "MapTable",
    			options,
    			id: create_fragment$9.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*data*/ ctx[0] === undefined && !("data" in props)) {
    			console.warn("<MapTable> was created without expected prop 'data'");
    		}

    		if (/*currentYear*/ ctx[14] === undefined && !("currentYear" in props)) {
    			console.warn("<MapTable> was created without expected prop 'currentYear'");
    		}

    		if (/*baseYearOrder*/ ctx[15] === undefined && !("baseYearOrder" in props)) {
    			console.warn("<MapTable> was created without expected prop 'baseYearOrder'");
    		}

    		if (/*hovered*/ ctx[16] === undefined && !("hovered" in props)) {
    			console.warn("<MapTable> was created without expected prop 'hovered'");
    		}

    		if (/*hoveredColor*/ ctx[17] === undefined && !("hoveredColor" in props)) {
    			console.warn("<MapTable> was created without expected prop 'hoveredColor'");
    		}
    	}

    	get data() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showTitle() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showTitle(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get currentYear() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set currentYear(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get baseYearOrder() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set baseYearOrder(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hovered() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hovered(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hoveredColor() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hoveredColor(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get colorScale() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set colorScale(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get valueFormat() {
    		throw new Error("<MapTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set valueFormat(value) {
    		throw new Error("<MapTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\SimpleMap.svelte generated by Svelte v3.16.0 */
    const file$a = "src\\SimpleMap.svelte";

    function get_each_context_1$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[30] = list[i];
    	return child_ctx;
    }

    function get_each_context$6(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[27] = list[i];
    	return child_ctx;
    }

    // (231:2) {:else}
    function create_else_block$3(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "Choose a combination of selections and click \"Show\" to see a map of the\r\n      model's projections.";
    			attr_dev(div, "class", "notification");
    			add_location(div, file$a, 231, 4, 7014);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$3.name,
    		type: "else",
    		source: "(231:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (119:2) {#if data.values}
    function create_if_block$3(ctx) {
    	let h1;
    	let t0_value = /*params*/ ctx[6]["type"] + "";
    	let t0;
    	let t1;
    	let t2_value = /*params*/ ctx[6]["locationType"] + "";
    	let t2;
    	let t3;
    	let t4;

    	let t5_value = (/*currentYear*/ ctx[3] >= /*projectionStartYear*/ ctx[2]
    	? " (Projected)"
    	: "") + "";

    	let t5;
    	let t6;
    	let h2;

    	let t7_value = permute(/*params*/ ctx[6], [
    		"calculation",
    		"setting",
    		"education",
    		"fteOrHeadcount",
    		"rateOrTotal",
    		.../*data*/ ctx[0].params.filter(func$2).map(func_1$2)
    	]).join(", ") + "";

    	let t7;
    	let t8;
    	let div2;
    	let div0;
    	let t9;
    	let div1;
    	let svg;
    	let g;
    	let svg_viewBox_value;
    	let t10;
    	let div4;
    	let div3;
    	let t11;
    	let span;
    	let t12;

    	let t13_value = (/*currentYear*/ ctx[3] >= /*projectionStartYear*/ ctx[2]
    	? " (Projected)"
    	: "") + "";

    	let t13;
    	let t14;
    	let input;
    	let input_min_value;
    	let input_max_value;
    	let t15;
    	let current;
    	let dispose;

    	const rowchart = new RowChart({
    			props: {
    				mapYearDataArray: /*mapYearDataArray*/ ctx[10],
    				valueExtentAllTime: /*valueExtentAllTime*/ ctx[12],
    				locationType: /*params*/ ctx[6]["locationType"],
    				rateOrTotal: /*params*/ ctx[6]["rateOrTotal"],
    				hovered: /*hovered*/ ctx[4],
    				hoveredColor,
    				tickFormat: /*valueFormat*/ ctx[13],
    				calculation: /*calculation*/ ctx[14]
    			},
    			$$inline: true
    		});

    	rowchart.$on("locationHover", /*locationHover_handler*/ ctx[23]);
    	rowchart.$on("locationLeave", /*handleLocationLeave*/ ctx[16]);
    	let if_block = /*geoJSON*/ ctx[1] && /*path*/ ctx[5] && create_if_block_1$3(ctx);

    	const maptable = new MapTable({
    			props: {
    				data: /*data*/ ctx[0],
    				showTitle: false,
    				colorScale: /*color*/ ctx[9],
    				currentYear: /*currentYear*/ ctx[3],
    				baseYearOrder: /*baseYearOrder*/ ctx[8],
    				hovered: /*hovered*/ ctx[4],
    				hoveredColor,
    				valueFormat: /*valueFormat*/ ctx[13]
    			},
    			$$inline: true
    		});

    	maptable.$on("locationHover", /*locationHover_handler_1*/ ctx[26]);
    	maptable.$on("locationLeave", /*handleLocationLeave*/ ctx[16]);

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t0 = text(t0_value);
    			t1 = text("s by ");
    			t2 = text(t2_value);
    			t3 = text(", North Carolina, ");
    			t4 = text(/*currentYear*/ ctx[3]);
    			t5 = text(t5_value);
    			t6 = space();
    			h2 = element("h2");
    			t7 = text(t7_value);
    			t8 = space();
    			div2 = element("div");
    			div0 = element("div");
    			create_component(rowchart.$$.fragment);
    			t9 = space();
    			div1 = element("div");
    			svg = svg_element("svg");
    			g = svg_element("g");
    			if (if_block) if_block.c();
    			t10 = space();
    			div4 = element("div");
    			div3 = element("div");
    			t11 = text("Year of Selected Projection to Map:\r\n        ");
    			span = element("span");
    			t12 = text(/*currentYear*/ ctx[3]);
    			t13 = text(t13_value);
    			t14 = space();
    			input = element("input");
    			t15 = space();
    			create_component(maptable.$$.fragment);
    			attr_dev(h1, "class", "title is-4");
    			add_location(h1, file$a, 119, 4, 3230);
    			attr_dev(h2, "class", "subtitle is-6");
    			add_location(h2, file$a, 125, 4, 3437);
    			attr_dev(div0, "class", "column is-three-fifths");
    			set_style(div0, "padding", "0px 0px 0px 5px");
    			add_location(div0, file$a, 139, 6, 3783);
    			add_location(g, file$a, 155, 10, 4428);
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + width$3 + " " + height$2);
    			attr_dev(svg, "id", "map-svg");
    			add_location(svg, file$a, 154, 8, 4367);
    			attr_dev(div1, "class", "column is-two-fifths");
    			set_style(div1, "padding", "0px 5px 0px 0px");
    			add_location(div1, file$a, 153, 6, 4289);
    			attr_dev(div2, "class", "columns");
    			add_location(div2, file$a, 138, 4, 3754);
    			attr_dev(span, "class", "range-output");
    			add_location(span, file$a, 202, 8, 6291);
    			attr_dev(div3, "class", "range-title");
    			add_location(div3, file$a, 200, 6, 6211);
    			attr_dev(input, "class", "slider");
    			attr_dev(input, "name", "input");
    			attr_dev(input, "type", "range");
    			attr_dev(input, "min", input_min_value = /*yearExtent*/ ctx[7][0]);
    			attr_dev(input, "max", input_max_value = /*yearExtent*/ ctx[7][1]);
    			attr_dev(input, "step", "1");
    			add_location(input, file$a, 208, 6, 6466);
    			attr_dev(div4, "class", "range");
    			add_location(div4, file$a, 199, 4, 6184);

    			dispose = [
    				listen_dev(input, "change", /*input_change_input_handler*/ ctx[25]),
    				listen_dev(input, "input", /*input_change_input_handler*/ ctx[25])
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t0);
    			append_dev(h1, t1);
    			append_dev(h1, t2);
    			append_dev(h1, t3);
    			append_dev(h1, t4);
    			append_dev(h1, t5);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, h2, anchor);
    			append_dev(h2, t7);
    			insert_dev(target, t8, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			mount_component(rowchart, div0, null);
    			append_dev(div2, t9);
    			append_dev(div2, div1);
    			append_dev(div1, svg);
    			append_dev(svg, g);
    			if (if_block) if_block.m(g, null);
    			insert_dev(target, t10, anchor);
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div3);
    			append_dev(div3, t11);
    			append_dev(div3, span);
    			append_dev(span, t12);
    			append_dev(span, t13);
    			append_dev(div4, t14);
    			append_dev(div4, input);
    			set_input_value(input, /*currentYear*/ ctx[3]);
    			append_dev(div4, t15);
    			mount_component(maptable, div4, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty & /*params*/ 64) && t0_value !== (t0_value = /*params*/ ctx[6]["type"] + "")) set_data_dev(t0, t0_value);
    			if ((!current || dirty & /*params*/ 64) && t2_value !== (t2_value = /*params*/ ctx[6]["locationType"] + "")) set_data_dev(t2, t2_value);
    			if (!current || dirty & /*currentYear*/ 8) set_data_dev(t4, /*currentYear*/ ctx[3]);

    			if ((!current || dirty & /*currentYear, projectionStartYear*/ 12) && t5_value !== (t5_value = (/*currentYear*/ ctx[3] >= /*projectionStartYear*/ ctx[2]
    			? " (Projected)"
    			: "") + "")) set_data_dev(t5, t5_value);

    			if ((!current || dirty & /*params, data*/ 65) && t7_value !== (t7_value = permute(/*params*/ ctx[6], [
    				"calculation",
    				"setting",
    				"education",
    				"fteOrHeadcount",
    				"rateOrTotal",
    				.../*data*/ ctx[0].params.filter(func$2).map(func_1$2)
    			]).join(", ") + "")) set_data_dev(t7, t7_value);

    			const rowchart_changes = {};
    			if (dirty & /*mapYearDataArray*/ 1024) rowchart_changes.mapYearDataArray = /*mapYearDataArray*/ ctx[10];
    			if (dirty & /*valueExtentAllTime*/ 4096) rowchart_changes.valueExtentAllTime = /*valueExtentAllTime*/ ctx[12];
    			if (dirty & /*params*/ 64) rowchart_changes.locationType = /*params*/ ctx[6]["locationType"];
    			if (dirty & /*params*/ 64) rowchart_changes.rateOrTotal = /*params*/ ctx[6]["rateOrTotal"];
    			if (dirty & /*hovered*/ 16) rowchart_changes.hovered = /*hovered*/ ctx[4];
    			if (dirty & /*valueFormat*/ 8192) rowchart_changes.tickFormat = /*valueFormat*/ ctx[13];
    			if (dirty & /*calculation*/ 16384) rowchart_changes.calculation = /*calculation*/ ctx[14];
    			rowchart.$set(rowchart_changes);

    			if (/*geoJSON*/ ctx[1] && /*path*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$3(ctx);
    					if_block.c();
    					if_block.m(g, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (!current || dirty & /*currentYear*/ 8) set_data_dev(t12, /*currentYear*/ ctx[3]);

    			if ((!current || dirty & /*currentYear, projectionStartYear*/ 12) && t13_value !== (t13_value = (/*currentYear*/ ctx[3] >= /*projectionStartYear*/ ctx[2]
    			? " (Projected)"
    			: "") + "")) set_data_dev(t13, t13_value);

    			if (!current || dirty & /*yearExtent*/ 128 && input_min_value !== (input_min_value = /*yearExtent*/ ctx[7][0])) {
    				attr_dev(input, "min", input_min_value);
    			}

    			if (!current || dirty & /*yearExtent*/ 128 && input_max_value !== (input_max_value = /*yearExtent*/ ctx[7][1])) {
    				attr_dev(input, "max", input_max_value);
    			}

    			if (dirty & /*currentYear*/ 8) {
    				set_input_value(input, /*currentYear*/ ctx[3]);
    			}

    			const maptable_changes = {};
    			if (dirty & /*data*/ 1) maptable_changes.data = /*data*/ ctx[0];
    			if (dirty & /*color*/ 512) maptable_changes.colorScale = /*color*/ ctx[9];
    			if (dirty & /*currentYear*/ 8) maptable_changes.currentYear = /*currentYear*/ ctx[3];
    			if (dirty & /*baseYearOrder*/ 256) maptable_changes.baseYearOrder = /*baseYearOrder*/ ctx[8];
    			if (dirty & /*hovered*/ 16) maptable_changes.hovered = /*hovered*/ ctx[4];
    			if (dirty & /*valueFormat*/ 8192) maptable_changes.valueFormat = /*valueFormat*/ ctx[13];
    			maptable.$set(maptable_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(rowchart.$$.fragment, local);
    			transition_in(maptable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(rowchart.$$.fragment, local);
    			transition_out(maptable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t8);
    			if (detaching) detach_dev(div2);
    			destroy_component(rowchart);
    			if (if_block) if_block.d();
    			if (detaching) detach_dev(t10);
    			if (detaching) detach_dev(div4);
    			destroy_component(maptable);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(119:2) {#if data.values}",
    		ctx
    	});

    	return block;
    }

    // (157:12) {#if geoJSON && path}
    function create_if_block_1$3(ctx) {
    	let each_1_anchor;
    	let each_value = /*geoJSON*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$6(get_each_context$6(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*geoJSON, hovered, hoveredColor, mapYearData, path, handleLocationHover, handleLocationLeave, valueFormat*/ 108594) {
    				each_value = /*geoJSON*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$6(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$6(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(157:12) {#if geoJSON && path}",
    		ctx
    	});

    	return block;
    }

    // (184:22) {#if mapYearData.has(+feature.properties.id)}
    function create_if_block_2$3(ctx) {
    	let title;
    	let t0_value = /*mapYearData*/ ctx[11].get(+/*feature*/ ctx[30].properties.id).name + "";
    	let t0;
    	let t1;
    	let t2_value = /*valueFormat*/ ctx[13](/*mapYearData*/ ctx[11].get(+/*feature*/ ctx[30].properties.id).value) + "";
    	let t2;

    	const block = {
    		c: function create() {
    			title = svg_element("title");
    			t0 = text(t0_value);
    			t1 = text(": ");
    			t2 = text(t2_value);
    			add_location(title, file$a, 184, 24, 5736);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, title, anchor);
    			append_dev(title, t0);
    			append_dev(title, t1);
    			append_dev(title, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*mapYearData, geoJSON*/ 2050 && t0_value !== (t0_value = /*mapYearData*/ ctx[11].get(+/*feature*/ ctx[30].properties.id).name + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*valueFormat, mapYearData, geoJSON*/ 10242 && t2_value !== (t2_value = /*valueFormat*/ ctx[13](/*mapYearData*/ ctx[11].get(+/*feature*/ ctx[30].properties.id).value) + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(title);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$3.name,
    		type: "if",
    		source: "(184:22) {#if mapYearData.has(+feature.properties.id)}",
    		ctx
    	});

    	return block;
    }

    // (160:18) {#each layer.geo.features as feature}
    function create_each_block_1$5(ctx) {
    	let path_1;
    	let show_if = /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id);
    	let path_1_fill_value;
    	let path_1_stroke_width_value;
    	let path_1_d_value;
    	let dispose;
    	let if_block = show_if && create_if_block_2$3(ctx);

    	function mouseenter_handler(...args) {
    		return /*mouseenter_handler*/ ctx[24](/*feature*/ ctx[30], ...args);
    	}

    	const block = {
    		c: function create() {
    			path_1 = svg_element("path");
    			if (if_block) if_block.c();
    			attr_dev(path_1, "class", "feature");

    			attr_dev(path_1, "fill", path_1_fill_value = /*hovered*/ ctx[4] == +/*feature*/ ctx[30].properties.id
    			? hoveredColor
    			: /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id)
    				? /*mapYearData*/ ctx[11].get(+/*feature*/ ctx[30].properties.id).fill
    				: "none");

    			attr_dev(path_1, "stroke-width", path_1_stroke_width_value = /*layer*/ ctx[27].name == "county"
    			? 1
    			: /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id)
    				? 2
    				: 0);

    			attr_dev(path_1, "stroke", "#333");

    			set_style(path_1, "pointer-events", /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id)
    			? "all"
    			: "none");

    			attr_dev(path_1, "d", path_1_d_value = /*path*/ ctx[5](/*feature*/ ctx[30]));
    			add_location(path_1, file$a, 160, 20, 4625);

    			dispose = [
    				listen_dev(path_1, "mouseenter", mouseenter_handler, false, false, false),
    				listen_dev(path_1, "mouseleave", /*handleLocationLeave*/ ctx[16], false, false, false)
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path_1, anchor);
    			if (if_block) if_block.m(path_1, null);
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*mapYearData, geoJSON*/ 2050) show_if = /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2$3(ctx);
    					if_block.c();
    					if_block.m(path_1, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*hovered, geoJSON, mapYearData*/ 2066 && path_1_fill_value !== (path_1_fill_value = /*hovered*/ ctx[4] == +/*feature*/ ctx[30].properties.id
    			? hoveredColor
    			: /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id)
    				? /*mapYearData*/ ctx[11].get(+/*feature*/ ctx[30].properties.id).fill
    				: "none")) {
    				attr_dev(path_1, "fill", path_1_fill_value);
    			}

    			if (dirty & /*geoJSON, mapYearData*/ 2050 && path_1_stroke_width_value !== (path_1_stroke_width_value = /*layer*/ ctx[27].name == "county"
    			? 1
    			: /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id)
    				? 2
    				: 0)) {
    				attr_dev(path_1, "stroke-width", path_1_stroke_width_value);
    			}

    			if (dirty & /*mapYearData, geoJSON*/ 2050) {
    				set_style(path_1, "pointer-events", /*mapYearData*/ ctx[11].has(+/*feature*/ ctx[30].properties.id)
    				? "all"
    				: "none");
    			}

    			if (dirty & /*path, geoJSON*/ 34 && path_1_d_value !== (path_1_d_value = /*path*/ ctx[5](/*feature*/ ctx[30]))) {
    				attr_dev(path_1, "d", path_1_d_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path_1);
    			if (if_block) if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$5.name,
    		type: "each",
    		source: "(160:18) {#each layer.geo.features as feature}",
    		ctx
    	});

    	return block;
    }

    // (158:14) {#each geoJSON as layer}
    function create_each_block$6(ctx) {
    	let g;
    	let g_class_value;
    	let each_value_1 = /*layer*/ ctx[27].geo.features;
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$5(get_each_context_1$5(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			g = svg_element("g");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(g, "class", g_class_value = /*layer*/ ctx[27].name);
    			add_location(g, file$a, 158, 16, 4524);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g, null);
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*hovered, geoJSON, hoveredColor, mapYearData, path, handleLocationHover, handleLocationLeave, valueFormat*/ 108594) {
    				each_value_1 = /*layer*/ ctx[27].geo.features;
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$5(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(g, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty & /*geoJSON*/ 2 && g_class_value !== (g_class_value = /*layer*/ ctx[27].name)) {
    				attr_dev(g, "class", g_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$6.name,
    		type: "each",
    		source: "(158:14) {#each geoJSON as layer}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block$3, create_else_block$3];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*data*/ ctx[0].values) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "id", "simple-map-container");
    			add_location(div, file$a, 117, 0, 3172);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const baseYear = 2019;
    const hoveredColor = "#898989";
    const width$3 = 320;
    const height$2 = 160;
    const func$2 = d => d[0].includes("Scenario");
    const func_1$2 = d => d[0];

    function instance$a($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	let { geoJSON } = $$props;
    	let { projectionStartYear } = $$props;
    	let currentYear = 2019;
    	let hovered = undefined;
    	const locationNamesMap = new Map(options.get("location").options.map(d => [d.value, d.label]));
    	const metroNonmetroColorScale = ordinal().domain(["700", "701"]).range(["#1f78b4", "#33a02c"]);
    	let path;
    	let projection;

    	function handleLocationHover(id) {
    		$$invalidate(4, hovered = id);
    	}

    	function handleLocationLeave() {
    		$$invalidate(4, hovered = undefined);
    	}

    	const writable_props = ["data", "geoJSON", "projectionStartYear"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<SimpleMap> was created with unknown prop '${key}'`);
    	});

    	const locationHover_handler = e => handleLocationHover(e.detail);
    	const mouseenter_handler = feature => handleLocationHover(+feature.properties.id);

    	function input_change_input_handler() {
    		currentYear = to_number(this.value);
    		$$invalidate(3, currentYear);
    	}

    	const locationHover_handler_1 = e => handleLocationHover(e.detail);

    	$$self.$set = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("geoJSON" in $$props) $$invalidate(1, geoJSON = $$props.geoJSON);
    		if ("projectionStartYear" in $$props) $$invalidate(2, projectionStartYear = $$props.projectionStartYear);
    	};

    	$$self.$capture_state = () => {
    		return {
    			data,
    			geoJSON,
    			projectionStartYear,
    			currentYear,
    			hovered,
    			path,
    			projection,
    			params,
    			yearExtent,
    			baseYearOrder,
    			currentYearOrder,
    			currentYearData,
    			color,
    			mapYearDataArray,
    			mapYearData,
    			valueExtentAllTime,
    			colorScheme,
    			valueFormat,
    			calculation
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("geoJSON" in $$props) $$invalidate(1, geoJSON = $$props.geoJSON);
    		if ("projectionStartYear" in $$props) $$invalidate(2, projectionStartYear = $$props.projectionStartYear);
    		if ("currentYear" in $$props) $$invalidate(3, currentYear = $$props.currentYear);
    		if ("hovered" in $$props) $$invalidate(4, hovered = $$props.hovered);
    		if ("path" in $$props) $$invalidate(5, path = $$props.path);
    		if ("projection" in $$props) $$invalidate(17, projection = $$props.projection);
    		if ("params" in $$props) $$invalidate(6, params = $$props.params);
    		if ("yearExtent" in $$props) $$invalidate(7, yearExtent = $$props.yearExtent);
    		if ("baseYearOrder" in $$props) $$invalidate(8, baseYearOrder = $$props.baseYearOrder);
    		if ("currentYearOrder" in $$props) $$invalidate(18, currentYearOrder = $$props.currentYearOrder);
    		if ("currentYearData" in $$props) $$invalidate(19, currentYearData = $$props.currentYearData);
    		if ("color" in $$props) $$invalidate(9, color = $$props.color);
    		if ("mapYearDataArray" in $$props) $$invalidate(10, mapYearDataArray = $$props.mapYearDataArray);
    		if ("mapYearData" in $$props) $$invalidate(11, mapYearData = $$props.mapYearData);
    		if ("valueExtentAllTime" in $$props) $$invalidate(12, valueExtentAllTime = $$props.valueExtentAllTime);
    		if ("colorScheme" in $$props) $$invalidate(20, colorScheme = $$props.colorScheme);
    		if ("valueFormat" in $$props) $$invalidate(13, valueFormat = $$props.valueFormat);
    		if ("calculation" in $$props) $$invalidate(14, calculation = $$props.calculation);
    	};

    	let params;
    	let yearExtent;
    	let baseYearOrder;
    	let currentYearOrder;
    	let currentYearData;
    	let mapYearDataArray;
    	let mapYearData;
    	let valueExtentAllTime;
    	let colorScheme;
    	let color;
    	let valueFormat;
    	let calculation;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*data*/ 1) {
    			 $$invalidate(6, params = data.params
    			? data.params.reduce(
    					(acc, curr) => {
    						acc[curr[0]] = options.get(curr[0]).options.find(d => d.value == curr[1]).label;
    						return acc;
    					},
    					{}
    				)
    			: {});
    		}

    		if ($$self.$$.dirty & /*data*/ 1) {
    			 $$invalidate(7, yearExtent = extent(data.values || [{ year: 2019 }, { year: 2032 }], d => d.year));
    		}

    		if ($$self.$$.dirty & /*data*/ 1) {
    			 $$invalidate(8, baseYearOrder = data.values.filter(d => d.year == baseYear).sort((a, b) => b.value - a.value).map(d => d.location));
    		}

    		if ($$self.$$.dirty & /*data, currentYear*/ 9) {
    			 $$invalidate(18, currentYearOrder = data.values.filter(d => d.year == currentYear).sort((a, b) => a.value - b.value).map(d => d.location));
    		}

    		if ($$self.$$.dirty & /*baseYearOrder*/ 256) {
    			 $$invalidate(20, colorScheme = quantize(interpolateHcl("#e0f3db", "#084081"), baseYearOrder.length));
    		}

    		if ($$self.$$.dirty & /*params, currentYearOrder, colorScheme*/ 1310784) {
    			 $$invalidate(9, color = params["locationType"] == "Metro/Nonmetro"
    			? metroNonmetroColorScale
    			: ordinal().domain(currentYearOrder).range(colorScheme));
    		}

    		if ($$self.$$.dirty & /*data, currentYear, color*/ 521) {
    			 $$invalidate(19, currentYearData = new Map(data.values.filter(d => d.year == currentYear).map(d => [
    					d.location,
    					{
    						fill: color(d.location),
    						fontFill: fontColor(color(d.value)),
    						value: d.value,
    						name: locationNamesMap.get(d.location)
    					}
    				])));
    		}

    		if ($$self.$$.dirty & /*baseYearOrder, currentYearData*/ 524544) {
    			 $$invalidate(10, mapYearDataArray = baseYearOrder.map(d => [d, currentYearData.get(d)]));
    		}

    		if ($$self.$$.dirty & /*mapYearDataArray*/ 1024) {
    			 $$invalidate(11, mapYearData = new Map(mapYearDataArray));
    		}

    		if ($$self.$$.dirty & /*data*/ 1) {
    			 $$invalidate(12, valueExtentAllTime = extent(data.values || [], d => d.value).map((d, i) => i == 0 && d > 0 ? 0 : d));
    		}

    		if ($$self.$$.dirty & /*data*/ 1) {
    			 $$invalidate(14, calculation = data.params.find(d => d[0] === "calculation")[1]);
    		}

    		if ($$self.$$.dirty & /*calculation*/ 16384) {
    			 $$invalidate(13, valueFormat = val => calculation === "percentage"
    			? val.toLocaleString(undefined, {
    					style: "percent",
    					signDisplay: "exceptZero"
    				})
    			: val.toLocaleString());
    		}

    		if ($$self.$$.dirty & /*geoJSON, projection*/ 131074) {
    			 if (geoJSON) {
    				$$invalidate(17, projection = geoAlbers().rotate([0, 62, 0]).fitSize([width$3, height$2], geoJSON[0].geo));
    				$$invalidate(5, path = geoPath(projection));
    			}
    		}
    	};

    	return [
    		data,
    		geoJSON,
    		projectionStartYear,
    		currentYear,
    		hovered,
    		path,
    		params,
    		yearExtent,
    		baseYearOrder,
    		color,
    		mapYearDataArray,
    		mapYearData,
    		valueExtentAllTime,
    		valueFormat,
    		calculation,
    		handleLocationHover,
    		handleLocationLeave,
    		projection,
    		currentYearOrder,
    		currentYearData,
    		colorScheme,
    		locationNamesMap,
    		metroNonmetroColorScale,
    		locationHover_handler,
    		mouseenter_handler,
    		input_change_input_handler,
    		locationHover_handler_1
    	];
    }

    class SimpleMap extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			data: 0,
    			geoJSON: 1,
    			projectionStartYear: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "SimpleMap",
    			options,
    			id: create_fragment$a.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*data*/ ctx[0] === undefined && !("data" in props)) {
    			console.warn("<SimpleMap> was created without expected prop 'data'");
    		}

    		if (/*geoJSON*/ ctx[1] === undefined && !("geoJSON" in props)) {
    			console.warn("<SimpleMap> was created without expected prop 'geoJSON'");
    		}

    		if (/*projectionStartYear*/ ctx[2] === undefined && !("projectionStartYear" in props)) {
    			console.warn("<SimpleMap> was created without expected prop 'projectionStartYear'");
    		}
    	}

    	get data() {
    		throw new Error("<SimpleMap>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<SimpleMap>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get geoJSON() {
    		throw new Error("<SimpleMap>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set geoJSON(value) {
    		throw new Error("<SimpleMap>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get projectionStartYear() {
    		throw new Error("<SimpleMap>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set projectionStartYear(value) {
    		throw new Error("<SimpleMap>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\SimpleSelect.svelte generated by Svelte v3.16.0 */

    const file$b = "src\\SimpleSelect.svelte";

    function get_each_context$7(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	return child_ctx;
    }

    // (10:0) {#if display}
    function create_if_block$4(ctx) {
    	let div2;
    	let label_1;
    	let t0;
    	let t1;
    	let t2;
    	let div1;
    	let div0;
    	let select;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[7].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);
    	let each_value = /*options*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$7(get_each_context$7(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			label_1 = element("label");
    			t0 = text(/*label*/ ctx[2]);
    			t1 = space();
    			if (default_slot) default_slot.c();
    			t2 = space();
    			div1 = element("div");
    			div0 = element("div");
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(label_1, "class", "label");
    			set_style(label_1, "display", "inline-flex");
    			add_location(label_1, file$b, 11, 4, 217);
    			attr_dev(select, "name", /*name*/ ctx[1]);
    			select.disabled = /*disabled*/ ctx[5];
    			add_location(select, file$b, 15, 8, 362);
    			attr_dev(div0, "class", "select ");
    			add_location(div0, file$b, 14, 6, 331);
    			attr_dev(div1, "class", "control");
    			add_location(div1, file$b, 13, 4, 302);
    			attr_dev(div2, "class", "field");
    			add_location(div2, file$b, 10, 2, 192);
    			dispose = listen_dev(select, "change", /*change_handler*/ ctx[8], false, false, false);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, label_1);
    			append_dev(label_1, t0);
    			append_dev(div2, t1);

    			if (default_slot) {
    				default_slot.m(div2, null);
    			}

    			append_dev(div2, t2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, select);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*label*/ 4) set_data_dev(t0, /*label*/ ctx[2]);

    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 64) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[6], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[6], dirty, null));
    			}

    			if (dirty & /*options, value*/ 24) {
    				each_value = /*options*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$7(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$7(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (!current || dirty & /*name*/ 2) {
    				attr_dev(select, "name", /*name*/ ctx[1]);
    			}

    			if (!current || dirty & /*disabled*/ 32) {
    				prop_dev(select, "disabled", /*disabled*/ ctx[5]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (default_slot) default_slot.d(detaching);
    			destroy_each(each_blocks, detaching);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(10:0) {#if display}",
    		ctx
    	});

    	return block;
    }

    // (17:10) {#each options as option}
    function create_each_block$7(ctx) {
    	let option;
    	let t0_value = /*option*/ ctx[9].label + "";
    	let t0;
    	let t1;
    	let option_value_value;
    	let option_selected_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = space();
    			option.__value = option_value_value = /*option*/ ctx[9].value;
    			option.value = option.__value;
    			option.selected = option_selected_value = /*option*/ ctx[9].value == /*value*/ ctx[4];
    			add_location(option, file$b, 17, 12, 449);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t0);
    			append_dev(option, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*options*/ 8 && t0_value !== (t0_value = /*option*/ ctx[9].label + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*options*/ 8 && option_value_value !== (option_value_value = /*option*/ ctx[9].value)) {
    				prop_dev(option, "__value", option_value_value);
    			}

    			option.value = option.__value;

    			if (dirty & /*options, value*/ 24 && option_selected_value !== (option_selected_value = /*option*/ ctx[9].value == /*value*/ ctx[4])) {
    				prop_dev(option, "selected", option_selected_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$7.name,
    		type: "each",
    		source: "(17:10) {#each options as option}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$b(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*display*/ ctx[0] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*display*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { display = true } = $$props;
    	let { name } = $$props;
    	let { label } = $$props;
    	let { options } = $$props;
    	let { value = "" } = $$props;
    	let { disabled = false } = $$props;
    	const writable_props = ["display", "name", "label", "options", "value", "disabled"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<SimpleSelect> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function change_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("display" in $$props) $$invalidate(0, display = $$props.display);
    		if ("name" in $$props) $$invalidate(1, name = $$props.name);
    		if ("label" in $$props) $$invalidate(2, label = $$props.label);
    		if ("options" in $$props) $$invalidate(3, options = $$props.options);
    		if ("value" in $$props) $$invalidate(4, value = $$props.value);
    		if ("disabled" in $$props) $$invalidate(5, disabled = $$props.disabled);
    		if ("$$scope" in $$props) $$invalidate(6, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => {
    		return {
    			display,
    			name,
    			label,
    			options,
    			value,
    			disabled
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("display" in $$props) $$invalidate(0, display = $$props.display);
    		if ("name" in $$props) $$invalidate(1, name = $$props.name);
    		if ("label" in $$props) $$invalidate(2, label = $$props.label);
    		if ("options" in $$props) $$invalidate(3, options = $$props.options);
    		if ("value" in $$props) $$invalidate(4, value = $$props.value);
    		if ("disabled" in $$props) $$invalidate(5, disabled = $$props.disabled);
    	};

    	return [
    		display,
    		name,
    		label,
    		options,
    		value,
    		disabled,
    		$$scope,
    		$$slots,
    		change_handler
    	];
    }

    class SimpleSelect extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {
    			display: 0,
    			name: 1,
    			label: 2,
    			options: 3,
    			value: 4,
    			disabled: 5
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "SimpleSelect",
    			options,
    			id: create_fragment$b.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*name*/ ctx[1] === undefined && !("name" in props)) {
    			console.warn("<SimpleSelect> was created without expected prop 'name'");
    		}

    		if (/*label*/ ctx[2] === undefined && !("label" in props)) {
    			console.warn("<SimpleSelect> was created without expected prop 'label'");
    		}

    		if (/*options*/ ctx[3] === undefined && !("options" in props)) {
    			console.warn("<SimpleSelect> was created without expected prop 'options'");
    		}
    	}

    	get display() {
    		throw new Error("<SimpleSelect>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set display(value) {
    		throw new Error("<SimpleSelect>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get name() {
    		throw new Error("<SimpleSelect>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<SimpleSelect>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<SimpleSelect>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<SimpleSelect>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get options() {
    		throw new Error("<SimpleSelect>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set options(value) {
    		throw new Error("<SimpleSelect>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<SimpleSelect>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<SimpleSelect>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<SimpleSelect>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<SimpleSelect>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\InfoBox.svelte generated by Svelte v3.16.0 */
    const file$c = "src\\InfoBox.svelte";

    // (34:2) {#if active}
    function create_if_block$5(ctx) {
    	let article;
    	let div0;
    	let p;
    	let t0;
    	let t1;
    	let button;
    	let t2;
    	let div1;
    	let t3;
    	let article_transition;
    	let current;
    	let dispose;

    	const block = {
    		c: function create() {
    			article = element("article");
    			div0 = element("div");
    			p = element("p");
    			t0 = text(/*title*/ ctx[0]);
    			t1 = space();
    			button = element("button");
    			t2 = space();
    			div1 = element("div");
    			t3 = text(/*info*/ ctx[1]);
    			add_location(p, file$c, 39, 8, 1077);
    			attr_dev(button, "class", "delete");
    			attr_dev(button, "aria-label", "delete");
    			add_location(button, file$c, 40, 8, 1101);
    			attr_dev(div0, "class", "message-header close-on-window-click");
    			add_location(div0, file$c, 38, 6, 1017);
    			attr_dev(div1, "class", "message-body close-on-window-click");
    			add_location(div1, file$c, 46, 6, 1275);
    			attr_dev(article, "class", "message is-small is-primary close-on-window-click svelte-fwg03d");
    			add_location(article, file$c, 34, 4, 906);
    			dispose = listen_dev(button, "click", stop_propagation(prevent_default(/*click_handler_1*/ ctx[7])), false, true, true);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, article, anchor);
    			append_dev(article, div0);
    			append_dev(div0, p);
    			append_dev(p, t0);
    			append_dev(div0, t1);
    			append_dev(div0, button);
    			append_dev(article, t2);
    			append_dev(article, div1);
    			append_dev(div1, t3);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*title*/ 1) set_data_dev(t0, /*title*/ ctx[0]);
    			if (!current || dirty & /*info*/ 2) set_data_dev(t3, /*info*/ ctx[1]);
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!article_transition) article_transition = create_bidirectional_transition(article, fade, {}, true);
    				article_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!article_transition) article_transition = create_bidirectional_transition(article, fade, {}, false);
    			article_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(article);
    			if (detaching && article_transition) article_transition.end();
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(34:2) {#if active}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$c(ctx) {
    	let div;
    	let svg;
    	let use;
    	let t;
    	let current;
    	let dispose;
    	let if_block = /*active*/ ctx[3] && create_if_block$5(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			use = svg_element("use");
    			t = space();
    			if (if_block) if_block.c();
    			xlink_attr(use, "xlink:href", "#fa-info-circle");
    			attr_dev(use, "class", "svelte-fwg03d");
    			toggle_class(use, "has-fill-white", /*invert*/ ctx[2]);
    			add_location(use, file$c, 31, 4, 808);
    			attr_dev(svg, "tabindex", "0");
    			attr_dev(svg, "class", "icon-svg has-fill-primary svelte-fwg03d");
    			add_location(svg, file$c, 25, 2, 638);
    			attr_dev(div, "class", "info-icon-wrapper  svelte-fwg03d");
    			add_location(div, file$c, 24, 0, 602);

    			dispose = [
    				listen_dev(window, "click", stop_propagation(/*windowClicked*/ ctx[4]), false, false, true),
    				listen_dev(window, "keydown", stop_propagation(/*onKeyDown*/ ctx[5]), false, false, true),
    				listen_dev(svg, "click", stop_propagation(/*click_handler*/ ctx[6]), false, false, true),
    				listen_dev(svg, "keydown", stop_propagation(/*onKeyDown*/ ctx[5]), false, false, true)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, use);
    			append_dev(div, t);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*invert*/ 4) {
    				toggle_class(use, "has-fill-white", /*invert*/ ctx[2]);
    			}

    			if (/*active*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { title = "Title" } = $$props;
    	let { info = "Information" } = $$props;
    	let { invert = false } = $$props;
    	let active = false;

    	function windowClicked(e) {
    		const classList = Array.from(e.target.classList);

    		if (!classList.includes("close-on-window-click") & active) {
    			$$invalidate(3, active = false);
    		}
    	}

    	function onKeyDown(e) {
    		if (e.keyCode === 13) $$invalidate(3, active = true);
    		if (e.keyCode === 27) $$invalidate(3, active = false);
    	}

    	const writable_props = ["title", "info", "invert"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<InfoBox> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => $$invalidate(3, active = true);
    	const click_handler_1 = () => $$invalidate(3, active = false);

    	$$self.$set = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("info" in $$props) $$invalidate(1, info = $$props.info);
    		if ("invert" in $$props) $$invalidate(2, invert = $$props.invert);
    	};

    	$$self.$capture_state = () => {
    		return { title, info, invert, active };
    	};

    	$$self.$inject_state = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("info" in $$props) $$invalidate(1, info = $$props.info);
    		if ("invert" in $$props) $$invalidate(2, invert = $$props.invert);
    		if ("active" in $$props) $$invalidate(3, active = $$props.active);
    	};

    	return [
    		title,
    		info,
    		invert,
    		active,
    		windowClicked,
    		onKeyDown,
    		click_handler,
    		click_handler_1
    	];
    }

    class InfoBox extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, { title: 0, info: 1, invert: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "InfoBox",
    			options,
    			id: create_fragment$c.name
    		});
    	}

    	get title() {
    		throw new Error("<InfoBox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<InfoBox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get info() {
    		throw new Error("<InfoBox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set info(value) {
    		throw new Error("<InfoBox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get invert() {
    		throw new Error("<InfoBox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set invert(value) {
    		throw new Error("<InfoBox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var formInfo = new Map([
        ["type", "Select either Licensed Practical Nurses (LPNs) or Registered Nurses (RNs)."],
        ["education", "This refers to the basic education for licensure. For registered nurses, you can select either those nurses who entered with an associate degree/diploma or with a BS or MS. For licensed practical nurses, this option is unavailable. You cannot select both an education subgroup and a setting subgroup for the same projection (e.g., BS & MS for Education and Hospital for Setting)."],
        ["rateOrTotal", "Select whether you want to see the nurse workforce as a total number or as a rate per 10,000 population. The latter is more useful for comparing different geographic areas."],
        ["fteOrHeadcount", "The model can display the projections for nurses as either full time equivalents (FTEs) or as headcounts. FTEs account for nurses who may be working less than full-time. 1 FTE = 40 hours/week, and no nurse has greater than 1 FTE."],
        ["locationType", "Select a geographic category or type. This selection changes the available options for location."],
        ["location", "Select a geography or location. These options change based on the selection of Location Type."],
        ["setting", "See the nurse workforce by practice setting, e.g., hospital or ambulatory care. You cannot select both an education subgroup and a setting subgroup for the same projection (e.g., BS & MS for Education and Hospital for Setting)."],
        ["scenario", "Select a scenario to see how it changes the projections."],
        ["calculation", `Select 'Supply' or 'Demand' to see those projections alone. Selecting 'Supply / Demand' will show both projections as a ratio. Selecting 'Supply - Demand' will show both the absolute difference between the two projections.`],
        ["difference", "The absolute difference between the supply and demand forecasts, calculated as supply minus demand for a give year. This calculation provides an estimate of the absolute number of nurses in surplus or shortage. It is important to note the overall numbers of nurses for a given projection when interpreting these values, e.g., a shortage of 1,000 nurses is much more concerning if you are looking at an underlying supply of 10,000 vs 100,000."],
        ["ratio", "The ratio between the supply and demand forecasts. When this is less than 1, it means demand is greater than supply. The calculation is useful for understanding the relative surplus or shortage for a projection."],
        ["supply", "The supply model projects the future headcount and FTE of RNs and LPNs from 2018-2030. The basic principle of supply modeling is to take the current workforce, subtract leavers and add joiners for each year to generate a forecast for the next year."],
        ["demand", "Demand was modeled at the county-level for each setting. Different approaches for calculating forecast demand were used as a result of the variation in data measuring existing demand. The demand forecast for public and community health, nursing education, and correctional facilities was solely dependent on population change (which means a 10% growth in population would generate a 10% growth in demand). For the remaining settings, separate regression models were developed to predict demand based on model predictors (e.g. gender, age, race) specific to that setting."],
        ["percentage", "The percentage shortage or surplus of supply relative to the demand forecasts. When this percentage is negative, it means demand is greater than supply. The calculation is useful for understanding the relative surplus or shortage for a projection."],

    ]);

    /* src\ModelForm.svelte generated by Svelte v3.16.0 */
    const file$d = "src\\ModelForm.svelte";

    // (141:6) {:else}
    function create_else_block_1$1(ctx) {
    	let label0;
    	let input0;
    	let t0;
    	let t1;
    	let label1;
    	let input1;
    	let t2;
    	let t3;
    	let label2;
    	let input2;
    	let t4;
    	let dispose;

    	const block = {
    		c: function create() {
    			label0 = element("label");
    			input0 = element("input");
    			t0 = text("\r\n          All Education");
    			t1 = space();
    			label1 = element("label");
    			input1 = element("input");
    			t2 = text("\r\n          BS & MS");
    			t3 = space();
    			label2 = element("label");
    			input2 = element("input");
    			t4 = text("\r\n          ADN & Diploma");
    			attr_dev(input0, "type", "radio");
    			attr_dev(input0, "name", "education");
    			input0.__value = "0";
    			input0.value = input0.__value;
    			input0.checked = true;
    			/*$$binding_groups*/ ctx[19][0].push(input0);
    			add_location(input0, file$d, 142, 10, 4251);
    			attr_dev(label0, "class", "radio");
    			add_location(label0, file$d, 141, 8, 4218);
    			attr_dev(input1, "type", "radio");
    			attr_dev(input1, "name", "education");
    			input1.__value = "4";
    			input1.value = input1.__value;
    			/*$$binding_groups*/ ctx[19][0].push(input1);
    			add_location(input1, file$d, 152, 10, 4497);
    			attr_dev(label1, "class", "radio");
    			add_location(label1, file$d, 151, 8, 4464);
    			attr_dev(input2, "type", "radio");
    			attr_dev(input2, "name", "education");
    			input2.__value = "5";
    			input2.value = input2.__value;
    			/*$$binding_groups*/ ctx[19][0].push(input2);
    			add_location(input2, file$d, 161, 10, 4716);
    			attr_dev(label2, "class", "radio");
    			add_location(label2, file$d, 160, 8, 4683);

    			dispose = [
    				listen_dev(input0, "change", /*input0_change_handler_1*/ ctx[21]),
    				listen_dev(input1, "change", /*input1_change_handler_1*/ ctx[22]),
    				listen_dev(input2, "change", /*input2_change_handler*/ ctx[23])
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label0, anchor);
    			append_dev(label0, input0);
    			input0.checked = input0.__value === /*educationType*/ ctx[5];
    			append_dev(label0, t0);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, label1, anchor);
    			append_dev(label1, input1);
    			input1.checked = input1.__value === /*educationType*/ ctx[5];
    			append_dev(label1, t2);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, label2, anchor);
    			append_dev(label2, input2);
    			input2.checked = input2.__value === /*educationType*/ ctx[5];
    			append_dev(label2, t4);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*educationType*/ 32) {
    				input0.checked = input0.__value === /*educationType*/ ctx[5];
    			}

    			if (dirty & /*educationType*/ 32) {
    				input1.checked = input1.__value === /*educationType*/ ctx[5];
    			}

    			if (dirty & /*educationType*/ 32) {
    				input2.checked = input2.__value === /*educationType*/ ctx[5];
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(label0);
    			/*$$binding_groups*/ ctx[19][0].splice(/*$$binding_groups*/ ctx[19][0].indexOf(input0), 1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(label1);
    			/*$$binding_groups*/ ctx[19][0].splice(/*$$binding_groups*/ ctx[19][0].indexOf(input1), 1);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(label2);
    			/*$$binding_groups*/ ctx[19][0].splice(/*$$binding_groups*/ ctx[19][0].indexOf(input2), 1);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1$1.name,
    		type: "else",
    		source: "(141:6) {:else}",
    		ctx
    	});

    	return block;
    }

    // (136:6) {#if nurseType == "1" || settingType != "0" || calculation != "supply" || chartType == "table"}
    function create_if_block_5(ctx) {
    	let label;
    	let input;
    	let t;

    	const block = {
    		c: function create() {
    			label = element("label");
    			input = element("input");
    			t = text("\r\n          All Education");
    			attr_dev(input, "type", "radio");
    			attr_dev(input, "name", "education");
    			input.value = "0";
    			input.checked = true;
    			input.disabled = true;
    			add_location(input, file$d, 137, 10, 4084);
    			attr_dev(label, "class", "radio");
    			attr_dev(label, "disabled", "");
    			add_location(label, file$d, 136, 8, 4042);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label, anchor);
    			append_dev(label, input);
    			append_dev(label, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(label);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(136:6) {#if nurseType == \\\"1\\\" || settingType != \\\"0\\\" || calculation != \\\"supply\\\" || chartType == \\\"table\\\"}",
    		ctx
    	});

    	return block;
    }

    // (190:6) {:else}
    function create_else_block$4(ctx) {
    	let label0;
    	let input0;
    	let t0;
    	let t1;
    	let label1;
    	let input1;
    	let t2;

    	const block = {
    		c: function create() {
    			label0 = element("label");
    			input0 = element("input");
    			t0 = text("\r\n          Total");
    			t1 = space();
    			label1 = element("label");
    			input1 = element("input");
    			t2 = text("\r\n          Rate per 10k population");
    			attr_dev(input0, "type", "radio");
    			attr_dev(input0, "name", "rateOrTotal");
    			input0.value = "1";
    			input0.checked = true;
    			add_location(input0, file$d, 191, 10, 5574);
    			attr_dev(label0, "class", "radio");
    			add_location(label0, file$d, 190, 8, 5541);
    			attr_dev(input1, "type", "radio");
    			attr_dev(input1, "name", "rateOrTotal");
    			input1.value = "0";
    			add_location(input1, file$d, 195, 10, 5711);
    			attr_dev(label1, "class", "radio");
    			add_location(label1, file$d, 194, 8, 5678);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label0, anchor);
    			append_dev(label0, input0);
    			append_dev(label0, t0);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, label1, anchor);
    			append_dev(label1, input1);
    			append_dev(label1, t2);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(label0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(label1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$4.name,
    		type: "else",
    		source: "(190:6) {:else}",
    		ctx
    	});

    	return block;
    }

    // (185:35) 
    function create_if_block_4(ctx) {
    	let label;
    	let input;
    	let t;

    	const block = {
    		c: function create() {
    			label = element("label");
    			input = element("input");
    			t = text("\r\n          Rate per 10K population");
    			attr_dev(input, "type", "radio");
    			attr_dev(input, "name", "rateOrTotal");
    			input.value = "0";
    			input.checked = true;
    			input.disabled = true;
    			add_location(input, file$d, 186, 10, 5395);
    			attr_dev(label, "class", "radio");
    			attr_dev(label, "disabled", "");
    			add_location(label, file$d, 185, 8, 5353);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label, anchor);
    			append_dev(label, input);
    			append_dev(label, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(label);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(185:35) ",
    		ctx
    	});

    	return block;
    }

    // (180:6) {#if calculation === "percentage"}
    function create_if_block_3$1(ctx) {
    	let label;
    	let input;
    	let t;

    	const block = {
    		c: function create() {
    			label = element("label");
    			input = element("input");
    			t = text("\r\n          Total");
    			attr_dev(input, "type", "radio");
    			attr_dev(input, "name", "rateOrTotal");
    			input.value = "1";
    			input.checked = true;
    			input.disabled = true;
    			add_location(input, file$d, 181, 10, 5203);
    			attr_dev(label, "class", "radio");
    			attr_dev(label, "disabled", "");
    			add_location(label, file$d, 180, 8, 5161);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label, anchor);
    			append_dev(label, input);
    			append_dev(label, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(label);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(180:6) {#if calculation === \\\"percentage\\\"}",
    		ctx
    	});

    	return block;
    }

    // (229:2) <SimpleSelect      on:change={handleLocationTypeChange}      value={currentLocationType}      {...locationTypeOptions}    >
    function create_default_slot_3(ctx) {
    	let current;

    	const infobox = new InfoBox({
    			props: {
    				title: "Location Type",
    				info: formInfo.get("locationType")
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(infobox.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(infobox, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(infobox.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(infobox.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(infobox, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(229:2) <SimpleSelect      on:change={handleLocationTypeChange}      value={currentLocationType}      {...locationTypeOptions}    >",
    		ctx
    	});

    	return block;
    }

    // (236:2) <SimpleSelect      display={chartType == "line" || chartType == "table"}      {...currentLocationOptions}    >
    function create_default_slot_2(ctx) {
    	let current;

    	const infobox = new InfoBox({
    			props: {
    				title: "Location",
    				info: formInfo.get("location")
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(infobox.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(infobox, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(infobox.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(infobox.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(infobox, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(236:2) <SimpleSelect      display={chartType == \\\"line\\\" || chartType == \\\"table\\\"}      {...currentLocationOptions}    >",
    		ctx
    	});

    	return block;
    }

    // (242:2) {#if chartType != "table"}
    function create_if_block_2$4(ctx) {
    	let current;

    	const simpleselect = new SimpleSelect({
    			props: {
    				options: options.get("setting").options.filter(/*func*/ ctx[24]).filter(/*func_1*/ ctx[25]),
    				name: options.get("setting").name,
    				label: options.get("setting").label,
    				disabled: /*educationType*/ ctx[5] != "0",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	simpleselect.$on("change", /*handleSettingChange*/ ctx[13]);

    	const block = {
    		c: function create() {
    			create_component(simpleselect.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(simpleselect, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const simpleselect_changes = {};
    			if (dirty & /*nurseType, chartType*/ 10) simpleselect_changes.options = options.get("setting").options.filter(/*func*/ ctx[24]).filter(/*func_1*/ ctx[25]);
    			if (dirty & /*educationType*/ 32) simpleselect_changes.disabled = /*educationType*/ ctx[5] != "0";

    			if (dirty & /*$$scope*/ 134217728) {
    				simpleselect_changes.$$scope = { dirty, ctx };
    			}

    			simpleselect.$set(simpleselect_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(simpleselect.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(simpleselect.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(simpleselect, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$4.name,
    		type: "if",
    		source: "(242:2) {#if chartType != \\\"table\\\"}",
    		ctx
    	});

    	return block;
    }

    // (245:4) <SimpleSelect        options={options          .get("setting")          .options.filter(            (d) =>              nurseType == 2 || (nurseType == 1) & (d.value != 6) & (d.value != 5)          )          .filter((d) => !((chartType === "map") & (d.value < 0)))}        name={options.get("setting").name}        label={options.get("setting").label}        disabled={educationType != "0"}        on:change={handleSettingChange}      >
    function create_default_slot_1(ctx) {
    	let current;

    	const infobox = new InfoBox({
    			props: {
    				title: "Setting",
    				info: formInfo.get("setting")
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(infobox.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(infobox, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(infobox.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(infobox.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(infobox, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(245:4) <SimpleSelect        options={options          .get(\\\"setting\\\")          .options.filter(            (d) =>              nurseType == 2 || (nurseType == 1) & (d.value != 6) & (d.value != 5)          )          .filter((d) => !((chartType === \\\"map\\\") & (d.value < 0)))}        name={options.get(\\\"setting\\\").name}        label={options.get(\\\"setting\\\").label}        disabled={educationType != \\\"0\\\"}        on:change={handleSettingChange}      >",
    		ctx
    	});

    	return block;
    }

    // (262:2) {#if calculation == "supply" || calculation == "difference" || calculation == "percentage"}
    function create_if_block_1$4(ctx) {
    	let current;
    	const simpleselect_spread_levels = [options.get("supplyScenario")];

    	let simpleselect_props = {
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < simpleselect_spread_levels.length; i += 1) {
    		simpleselect_props = assign(simpleselect_props, simpleselect_spread_levels[i]);
    	}

    	const simpleselect = new SimpleSelect({
    			props: simpleselect_props,
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(simpleselect.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(simpleselect, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const simpleselect_changes = dirty & /*options*/ 0
    			? get_spread_update(simpleselect_spread_levels, [get_spread_object(options.get("supplyScenario"))])
    			: {};

    			if (dirty & /*$$scope*/ 134217728) {
    				simpleselect_changes.$$scope = { dirty, ctx };
    			}

    			simpleselect.$set(simpleselect_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(simpleselect.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(simpleselect.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(simpleselect, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$4.name,
    		type: "if",
    		source: "(262:2) {#if calculation == \\\"supply\\\" || calculation == \\\"difference\\\" || calculation == \\\"percentage\\\"}",
    		ctx
    	});

    	return block;
    }

    // (263:4) <SimpleSelect {...options.get("supplyScenario")}>
    function create_default_slot(ctx) {
    	let current;

    	const infobox = new InfoBox({
    			props: {
    				title: "Supply Scenario",
    				info: formInfo.get("scenario")
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(infobox.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(infobox, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(infobox.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(infobox.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(infobox, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(263:4) <SimpleSelect {...options.get(\\\"supplyScenario\\\")}>",
    		ctx
    	});

    	return block;
    }

    // (279:4) {#if isLoading}
    function create_if_block$6(ctx) {
    	let progress;

    	const block = {
    		c: function create() {
    			progress = element("progress");
    			attr_dev(progress, "class", "progress is-small is-primary");
    			attr_dev(progress, "max", "100");
    			add_location(progress, file$d, 279, 6, 8418);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, progress, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(progress);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$6.name,
    		type: "if",
    		source: "(279:4) {#if isLoading}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$d(ctx) {
    	let form;
    	let div1;
    	let div0;
    	let label0;
    	let input0;
    	let t0;
    	let t1;
    	let label1;
    	let input1;
    	let t2;
    	let t3;
    	let t4;
    	let div3;
    	let div2;
    	let t5;
    	let t6;
    	let div5;
    	let div4;
    	let t7;
    	let t8;
    	let div7;
    	let div6;
    	let label2;
    	let input2;
    	let t9;
    	let t10;
    	let label3;
    	let input3;
    	let t11;
    	let t12;
    	let t13;
    	let t14;
    	let t15;
    	let t16;
    	let t17;
    	let div10;
    	let div8;
    	let button0;
    	let t19;
    	let div9;
    	let button1;
    	let t21;
    	let t22;
    	let hr;
    	let t23;
    	let button2;
    	let current;
    	let dispose;

    	const infobox0 = new InfoBox({
    			props: {
    				title: "Type of Nurse",
    				info: formInfo.get("type")
    			},
    			$$inline: true
    		});

    	function select_block_type(ctx, dirty) {
    		if (/*nurseType*/ ctx[3] == "1" || /*settingType*/ ctx[6] != "0" || /*calculation*/ ctx[0] != "supply" || /*chartType*/ ctx[1] == "table") return create_if_block_5;
    		return create_else_block_1$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);

    	const infobox1 = new InfoBox({
    			props: {
    				title: "Basic Education Degree for Licensure",
    				info: formInfo.get("education")
    			},
    			$$inline: true
    		});

    	function select_block_type_1(ctx, dirty) {
    		if (/*calculation*/ ctx[0] === "percentage") return create_if_block_3$1;
    		if (/*chartType*/ ctx[1] == "map") return create_if_block_4;
    		return create_else_block$4;
    	}

    	let current_block_type_1 = select_block_type_1(ctx);
    	let if_block1 = current_block_type_1(ctx);

    	const infobox2 = new InfoBox({
    			props: {
    				title: "Rate per 10,000 Population or Total",
    				info: formInfo.get("rateOrTotal")
    			},
    			$$inline: true
    		});

    	const infobox3 = new InfoBox({
    			props: {
    				title: "Full Time Equivalents (FTE) or Headcount",
    				info: formInfo.get("fteOrHeadcount")
    			},
    			$$inline: true
    		});

    	const simpleselect0_spread_levels = [{ value: /*currentLocationType*/ ctx[4] }, /*locationTypeOptions*/ ctx[8]];

    	let simpleselect0_props = {
    		$$slots: { default: [create_default_slot_3] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < simpleselect0_spread_levels.length; i += 1) {
    		simpleselect0_props = assign(simpleselect0_props, simpleselect0_spread_levels[i]);
    	}

    	const simpleselect0 = new SimpleSelect({
    			props: simpleselect0_props,
    			$$inline: true
    		});

    	simpleselect0.$on("change", /*handleLocationTypeChange*/ ctx[12]);

    	const simpleselect1_spread_levels = [
    		{
    			display: /*chartType*/ ctx[1] == "line" || /*chartType*/ ctx[1] == "table"
    		},
    		/*currentLocationOptions*/ ctx[9]
    	];

    	let simpleselect1_props = {
    		$$slots: { default: [create_default_slot_2] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < simpleselect1_spread_levels.length; i += 1) {
    		simpleselect1_props = assign(simpleselect1_props, simpleselect1_spread_levels[i]);
    	}

    	const simpleselect1 = new SimpleSelect({
    			props: simpleselect1_props,
    			$$inline: true
    		});

    	let if_block2 = /*chartType*/ ctx[1] != "table" && create_if_block_2$4(ctx);
    	let if_block3 = (/*calculation*/ ctx[0] == "supply" || /*calculation*/ ctx[0] == "difference" || /*calculation*/ ctx[0] == "percentage") && create_if_block_1$4(ctx);
    	let if_block4 = /*isLoading*/ ctx[2] && create_if_block$6(ctx);

    	const block = {
    		c: function create() {
    			form = element("form");
    			div1 = element("div");
    			div0 = element("div");
    			label0 = element("label");
    			input0 = element("input");
    			t0 = text("\r\n        RN");
    			t1 = space();
    			label1 = element("label");
    			input1 = element("input");
    			t2 = text("\r\n        LPN");
    			t3 = space();
    			create_component(infobox0.$$.fragment);
    			t4 = space();
    			div3 = element("div");
    			div2 = element("div");
    			if_block0.c();
    			t5 = space();
    			create_component(infobox1.$$.fragment);
    			t6 = space();
    			div5 = element("div");
    			div4 = element("div");
    			if_block1.c();
    			t7 = space();
    			create_component(infobox2.$$.fragment);
    			t8 = space();
    			div7 = element("div");
    			div6 = element("div");
    			label2 = element("label");
    			input2 = element("input");
    			t9 = text("\r\n        Headcount");
    			t10 = space();
    			label3 = element("label");
    			input3 = element("input");
    			t11 = text("\r\n        FTE");
    			t12 = space();
    			create_component(infobox3.$$.fragment);
    			t13 = space();
    			create_component(simpleselect0.$$.fragment);
    			t14 = space();
    			create_component(simpleselect1.$$.fragment);
    			t15 = space();
    			if (if_block2) if_block2.c();
    			t16 = space();
    			if (if_block3) if_block3.c();
    			t17 = space();
    			div10 = element("div");
    			div8 = element("div");
    			button0 = element("button");
    			button0.textContent = "Show";
    			t19 = space();
    			div9 = element("div");
    			button1 = element("button");
    			button1.textContent = "Clear";
    			t21 = space();
    			if (if_block4) if_block4.c();
    			t22 = space();
    			hr = element("hr");
    			t23 = space();
    			button2 = element("button");
    			button2.textContent = "Launch User Guide";
    			attr_dev(input0, "type", "radio");
    			attr_dev(input0, "name", "type");
    			input0.__value = "2";
    			input0.value = input0.__value;
    			input0.checked = true;
    			/*$$binding_groups*/ ctx[19][1].push(input0);
    			add_location(input0, file$d, 114, 8, 3328);
    			attr_dev(label0, "class", "radio");
    			add_location(label0, file$d, 113, 6, 3297);
    			attr_dev(input1, "type", "radio");
    			attr_dev(input1, "name", "type");
    			input1.__value = "1";
    			input1.value = input1.__value;
    			/*$$binding_groups*/ ctx[19][1].push(input1);
    			add_location(input1, file$d, 124, 8, 3534);
    			attr_dev(label1, "class", "radio");
    			add_location(label1, file$d, 123, 6, 3503);
    			attr_dev(div0, "class", "control");
    			add_location(div0, file$d, 112, 4, 3268);
    			attr_dev(div1, "class", "field");
    			add_location(div1, file$d, 111, 2, 3243);
    			attr_dev(div2, "class", "control");
    			add_location(div2, file$d, 132, 4, 3754);
    			attr_dev(div3, "class", "field");
    			add_location(div3, file$d, 131, 2, 3729);
    			attr_dev(div4, "class", "control");
    			add_location(div4, file$d, 178, 4, 5088);
    			attr_dev(div5, "class", "field");
    			add_location(div5, file$d, 177, 2, 5063);
    			attr_dev(input2, "type", "radio");
    			attr_dev(input2, "name", "fteOrHeadcount");
    			input2.value = "0";
    			input2.checked = true;
    			add_location(input2, file$d, 209, 8, 6066);
    			attr_dev(label2, "class", "radio");
    			add_location(label2, file$d, 208, 6, 6035);
    			attr_dev(input3, "type", "radio");
    			attr_dev(input3, "name", "fteOrHeadcount");
    			input3.value = "1";
    			add_location(input3, file$d, 213, 8, 6202);
    			attr_dev(label3, "class", "radio");
    			add_location(label3, file$d, 212, 6, 6171);
    			attr_dev(div6, "class", "control");
    			add_location(div6, file$d, 207, 4, 6006);
    			attr_dev(div7, "class", "field");
    			add_location(div7, file$d, 206, 2, 5981);
    			attr_dev(button0, "class", "button");
    			attr_dev(button0, "type", "submit");
    			toggle_class(button0, "is-yellowish", /*formHasChanged*/ ctx[7]);
    			add_location(button0, file$d, 269, 6, 8130);
    			attr_dev(div8, "class", "control");
    			add_location(div8, file$d, 268, 4, 8101);
    			attr_dev(button1, "class", "button");
    			attr_dev(button1, "type", "button");
    			add_location(button1, file$d, 274, 6, 8281);
    			attr_dev(div9, "class", "control");
    			add_location(div9, file$d, 273, 4, 8252);
    			attr_dev(div10, "class", "field is-grouped");
    			add_location(div10, file$d, 267, 2, 8065);
    			add_location(hr, file$d, 283, 2, 8504);
    			attr_dev(button2, "class", "button is-primary is-outlined is-center is-rounded");
    			attr_dev(button2, "id", "btn");
    			add_location(button2, file$d, 284, 2, 8514);
    			add_location(form, file$d, 107, 0, 3135);

    			dispose = [
    				listen_dev(input0, "change", /*input0_change_handler*/ ctx[18]),
    				listen_dev(input1, "change", /*input1_change_handler*/ ctx[20]),
    				listen_dev(button1, "click", /*handleClearData*/ ctx[11], false, false, false),
    				listen_dev(button2, "click", /*handleLaunchTutorial*/ ctx[14], false, false, false),
    				listen_dev(form, "submit", prevent_default(/*handleShowProjection*/ ctx[10]), false, true, false),
    				listen_dev(form, "change", /*change_handler*/ ctx[26], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, form, anchor);
    			append_dev(form, div1);
    			append_dev(div1, div0);
    			append_dev(div0, label0);
    			append_dev(label0, input0);
    			input0.checked = input0.__value === /*nurseType*/ ctx[3];
    			append_dev(label0, t0);
    			append_dev(div0, t1);
    			append_dev(div0, label1);
    			append_dev(label1, input1);
    			input1.checked = input1.__value === /*nurseType*/ ctx[3];
    			append_dev(label1, t2);
    			append_dev(div0, t3);
    			mount_component(infobox0, div0, null);
    			append_dev(form, t4);
    			append_dev(form, div3);
    			append_dev(div3, div2);
    			if_block0.m(div2, null);
    			append_dev(div2, t5);
    			mount_component(infobox1, div2, null);
    			append_dev(form, t6);
    			append_dev(form, div5);
    			append_dev(div5, div4);
    			if_block1.m(div4, null);
    			append_dev(div4, t7);
    			mount_component(infobox2, div4, null);
    			append_dev(form, t8);
    			append_dev(form, div7);
    			append_dev(div7, div6);
    			append_dev(div6, label2);
    			append_dev(label2, input2);
    			append_dev(label2, t9);
    			append_dev(div6, t10);
    			append_dev(div6, label3);
    			append_dev(label3, input3);
    			append_dev(label3, t11);
    			append_dev(div6, t12);
    			mount_component(infobox3, div6, null);
    			append_dev(form, t13);
    			mount_component(simpleselect0, form, null);
    			append_dev(form, t14);
    			mount_component(simpleselect1, form, null);
    			append_dev(form, t15);
    			if (if_block2) if_block2.m(form, null);
    			append_dev(form, t16);
    			if (if_block3) if_block3.m(form, null);
    			append_dev(form, t17);
    			append_dev(form, div10);
    			append_dev(div10, div8);
    			append_dev(div8, button0);
    			append_dev(div10, t19);
    			append_dev(div10, div9);
    			append_dev(div9, button1);
    			append_dev(div10, t21);
    			if (if_block4) if_block4.m(div10, null);
    			append_dev(form, t22);
    			append_dev(form, hr);
    			append_dev(form, t23);
    			append_dev(form, button2);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*nurseType*/ 8) {
    				input0.checked = input0.__value === /*nurseType*/ ctx[3];
    			}

    			if (dirty & /*nurseType*/ 8) {
    				input1.checked = input1.__value === /*nurseType*/ ctx[3];
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div2, t5);
    				}
    			}

    			if (current_block_type_1 !== (current_block_type_1 = select_block_type_1(ctx))) {
    				if_block1.d(1);
    				if_block1 = current_block_type_1(ctx);

    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(div4, t7);
    				}
    			}

    			const simpleselect0_changes = dirty & /*currentLocationType, locationTypeOptions*/ 272
    			? get_spread_update(simpleselect0_spread_levels, [
    					dirty & /*currentLocationType*/ 16 && ({ value: /*currentLocationType*/ ctx[4] }),
    					dirty & /*locationTypeOptions*/ 256 && get_spread_object(/*locationTypeOptions*/ ctx[8])
    				])
    			: {};

    			if (dirty & /*$$scope*/ 134217728) {
    				simpleselect0_changes.$$scope = { dirty, ctx };
    			}

    			simpleselect0.$set(simpleselect0_changes);

    			const simpleselect1_changes = dirty & /*chartType, currentLocationOptions*/ 514
    			? get_spread_update(simpleselect1_spread_levels, [
    					dirty & /*chartType*/ 2 && ({
    						display: /*chartType*/ ctx[1] == "line" || /*chartType*/ ctx[1] == "table"
    					}),
    					dirty & /*currentLocationOptions*/ 512 && get_spread_object(/*currentLocationOptions*/ ctx[9])
    				])
    			: {};

    			if (dirty & /*$$scope*/ 134217728) {
    				simpleselect1_changes.$$scope = { dirty, ctx };
    			}

    			simpleselect1.$set(simpleselect1_changes);

    			if (/*chartType*/ ctx[1] != "table") {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    					transition_in(if_block2, 1);
    				} else {
    					if_block2 = create_if_block_2$4(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(form, t16);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*calculation*/ ctx[0] == "supply" || /*calculation*/ ctx[0] == "difference" || /*calculation*/ ctx[0] == "percentage") {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    					transition_in(if_block3, 1);
    				} else {
    					if_block3 = create_if_block_1$4(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(form, t17);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (dirty & /*formHasChanged*/ 128) {
    				toggle_class(button0, "is-yellowish", /*formHasChanged*/ ctx[7]);
    			}

    			if (/*isLoading*/ ctx[2]) {
    				if (!if_block4) {
    					if_block4 = create_if_block$6(ctx);
    					if_block4.c();
    					if_block4.m(div10, null);
    				}
    			} else if (if_block4) {
    				if_block4.d(1);
    				if_block4 = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(infobox0.$$.fragment, local);
    			transition_in(infobox1.$$.fragment, local);
    			transition_in(infobox2.$$.fragment, local);
    			transition_in(infobox3.$$.fragment, local);
    			transition_in(simpleselect0.$$.fragment, local);
    			transition_in(simpleselect1.$$.fragment, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(infobox0.$$.fragment, local);
    			transition_out(infobox1.$$.fragment, local);
    			transition_out(infobox2.$$.fragment, local);
    			transition_out(infobox3.$$.fragment, local);
    			transition_out(simpleselect0.$$.fragment, local);
    			transition_out(simpleselect1.$$.fragment, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(form);
    			/*$$binding_groups*/ ctx[19][1].splice(/*$$binding_groups*/ ctx[19][1].indexOf(input0), 1);
    			/*$$binding_groups*/ ctx[19][1].splice(/*$$binding_groups*/ ctx[19][1].indexOf(input1), 1);
    			destroy_component(infobox0);
    			if_block0.d();
    			destroy_component(infobox1);
    			if_block1.d();
    			destroy_component(infobox2);
    			destroy_component(infobox3);
    			destroy_component(simpleselect0);
    			destroy_component(simpleselect1);
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$d.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$d($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { chartType } = $$props;
    	let { calculation } = $$props;
    	let { isLoading } = $$props;
    	let nurseType = "2";
    	let currentLocationType = 0;
    	let educationType = "0";
    	let settingType = "0";
    	let formHasChanged = true;

    	const locationOptions = new Map(Array.from(group(
    			options.get("location").options.map(d => ({
    				key: +d.value.toString().slice(0, 1),
    				value: d.value,
    				label: d.label
    			})),
    			d => d.key
    		)).map(d => [
    			d[0],
    			{
    				name: options.get("location").name,
    				label: options.get("location").label,
    				options: d[1].map(e => ({ label: e.label, value: e.value }))
    			}
    		]));

    	function handleShowProjection(event) {
    		let params = [];

    		for (let el of event.target) {
    			if (el.name && (el.type == "select-one" || el.checked == true)) {
    				params.push({
    					name: el.name,
    					value: el.value,
    					display: el.type == "select-one"
    					? el.selectedOptions[0].innerText
    					: el.parentElement.innerText.trim()
    				});
    			}
    		}

    		$$invalidate(7, formHasChanged = false);
    		dispatch("showProjection", params);
    	}

    	function handleClearData() {
    		dispatch("clearProjections");
    	}

    	function handleLocationTypeChange(e) {
    		$$invalidate(4, currentLocationType = +e.target.value);
    	}

    	function handleSettingChange(e) {
    		$$invalidate(6, settingType = e.target.value);
    	}

    	function handleCalculationChange(e) {
    		$$invalidate(0, calculation = e.target.value);
    	}

    	function handleLaunchTutorial() {
    		dispatch("launchTutorial");
    	}

    	const writable_props = ["chartType", "calculation", "isLoading"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ModelForm> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[], []];

    	function input0_change_handler() {
    		nurseType = this.__value;
    		$$invalidate(3, nurseType);
    	}

    	function input1_change_handler() {
    		nurseType = this.__value;
    		$$invalidate(3, nurseType);
    	}

    	function input0_change_handler_1() {
    		educationType = this.__value;
    		$$invalidate(5, educationType);
    	}

    	function input1_change_handler_1() {
    		educationType = this.__value;
    		$$invalidate(5, educationType);
    	}

    	function input2_change_handler() {
    		educationType = this.__value;
    		$$invalidate(5, educationType);
    	}

    	const func = d => nurseType == 2 || nurseType == 1 & d.value != 6 & d.value != 5;
    	const func_1 = d => !(chartType === "map" & d.value < 0);
    	const change_handler = () => $$invalidate(7, formHasChanged = true);

    	$$self.$set = $$props => {
    		if ("chartType" in $$props) $$invalidate(1, chartType = $$props.chartType);
    		if ("calculation" in $$props) $$invalidate(0, calculation = $$props.calculation);
    		if ("isLoading" in $$props) $$invalidate(2, isLoading = $$props.isLoading);
    	};

    	$$self.$capture_state = () => {
    		return {
    			chartType,
    			calculation,
    			isLoading,
    			nurseType,
    			currentLocationType,
    			educationType,
    			settingType,
    			formHasChanged,
    			locationTypeOptions,
    			currentLocationOptions
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("chartType" in $$props) $$invalidate(1, chartType = $$props.chartType);
    		if ("calculation" in $$props) $$invalidate(0, calculation = $$props.calculation);
    		if ("isLoading" in $$props) $$invalidate(2, isLoading = $$props.isLoading);
    		if ("nurseType" in $$props) $$invalidate(3, nurseType = $$props.nurseType);
    		if ("currentLocationType" in $$props) $$invalidate(4, currentLocationType = $$props.currentLocationType);
    		if ("educationType" in $$props) $$invalidate(5, educationType = $$props.educationType);
    		if ("settingType" in $$props) $$invalidate(6, settingType = $$props.settingType);
    		if ("formHasChanged" in $$props) $$invalidate(7, formHasChanged = $$props.formHasChanged);
    		if ("locationTypeOptions" in $$props) $$invalidate(8, locationTypeOptions = $$props.locationTypeOptions);
    		if ("currentLocationOptions" in $$props) $$invalidate(9, currentLocationOptions = $$props.currentLocationOptions);
    	};

    	let locationTypeOptions;
    	let currentLocationOptions;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*chartType*/ 2) {
    			 $$invalidate(8, locationTypeOptions = {
    				name: "locationType",
    				label: "Location Type",
    				options: options.get("locationType").options.filter(e => !(chartType == "map" && +e.value == 0))
    			});
    		}

    		if ($$self.$$.dirty & /*currentLocationType*/ 16) {
    			 $$invalidate(9, currentLocationOptions = locationOptions.get(currentLocationType));
    		}
    	};

    	return [
    		calculation,
    		chartType,
    		isLoading,
    		nurseType,
    		currentLocationType,
    		educationType,
    		settingType,
    		formHasChanged,
    		locationTypeOptions,
    		currentLocationOptions,
    		handleShowProjection,
    		handleClearData,
    		handleLocationTypeChange,
    		handleSettingChange,
    		handleLaunchTutorial,
    		dispatch,
    		locationOptions,
    		handleCalculationChange,
    		input0_change_handler,
    		$$binding_groups,
    		input1_change_handler,
    		input0_change_handler_1,
    		input1_change_handler_1,
    		input2_change_handler,
    		func,
    		func_1,
    		change_handler
    	];
    }

    class ModelForm extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
    			chartType: 1,
    			calculation: 0,
    			isLoading: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ModelForm",
    			options,
    			id: create_fragment$d.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*chartType*/ ctx[1] === undefined && !("chartType" in props)) {
    			console.warn("<ModelForm> was created without expected prop 'chartType'");
    		}

    		if (/*calculation*/ ctx[0] === undefined && !("calculation" in props)) {
    			console.warn("<ModelForm> was created without expected prop 'calculation'");
    		}

    		if (/*isLoading*/ ctx[2] === undefined && !("isLoading" in props)) {
    			console.warn("<ModelForm> was created without expected prop 'isLoading'");
    		}
    	}

    	get chartType() {
    		throw new Error("<ModelForm>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set chartType(value) {
    		throw new Error("<ModelForm>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get calculation() {
    		throw new Error("<ModelForm>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set calculation(value) {
    		throw new Error("<ModelForm>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isLoading() {
    		throw new Error("<ModelForm>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isLoading(value) {
    		throw new Error("<ModelForm>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var EOL = {},
        EOF = {},
        QUOTE = 34,
        NEWLINE = 10,
        RETURN = 13;

    function objectConverter(columns) {
      return new Function("d", "return {" + columns.map(function(name, i) {
        return JSON.stringify(name) + ": d[" + i + "] || \"\"";
      }).join(",") + "}");
    }

    function customConverter(columns, f) {
      var object = objectConverter(columns);
      return function(row, i) {
        return f(object(row), i, columns);
      };
    }

    // Compute unique columns in order of discovery.
    function inferColumns(rows) {
      var columnSet = Object.create(null),
          columns = [];

      rows.forEach(function(row) {
        for (var column in row) {
          if (!(column in columnSet)) {
            columns.push(columnSet[column] = column);
          }
        }
      });

      return columns;
    }

    function pad(value, width) {
      var s = value + "", length = s.length;
      return length < width ? new Array(width - length + 1).join(0) + s : s;
    }

    function formatYear(year) {
      return year < 0 ? "-" + pad(-year, 6)
        : year > 9999 ? "+" + pad(year, 6)
        : pad(year, 4);
    }

    function formatDate(date) {
      var hours = date.getUTCHours(),
          minutes = date.getUTCMinutes(),
          seconds = date.getUTCSeconds(),
          milliseconds = date.getUTCMilliseconds();
      return isNaN(date) ? "Invalid Date"
          : formatYear(date.getUTCFullYear()) + "-" + pad(date.getUTCMonth() + 1, 2) + "-" + pad(date.getUTCDate(), 2)
          + (milliseconds ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "." + pad(milliseconds, 3) + "Z"
          : seconds ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "Z"
          : minutes || hours ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + "Z"
          : "");
    }

    function dsv(delimiter) {
      var reFormat = new RegExp("[\"" + delimiter + "\n\r]"),
          DELIMITER = delimiter.charCodeAt(0);

      function parse(text, f) {
        var convert, columns, rows = parseRows(text, function(row, i) {
          if (convert) return convert(row, i - 1);
          columns = row, convert = f ? customConverter(row, f) : objectConverter(row);
        });
        rows.columns = columns || [];
        return rows;
      }

      function parseRows(text, f) {
        var rows = [], // output rows
            N = text.length,
            I = 0, // current character index
            n = 0, // current line number
            t, // current token
            eof = N <= 0, // current token followed by EOF?
            eol = false; // current token followed by EOL?

        // Strip the trailing newline.
        if (text.charCodeAt(N - 1) === NEWLINE) --N;
        if (text.charCodeAt(N - 1) === RETURN) --N;

        function token() {
          if (eof) return EOF;
          if (eol) return eol = false, EOL;

          // Unescape quotes.
          var i, j = I, c;
          if (text.charCodeAt(j) === QUOTE) {
            while (I++ < N && text.charCodeAt(I) !== QUOTE || text.charCodeAt(++I) === QUOTE);
            if ((i = I) >= N) eof = true;
            else if ((c = text.charCodeAt(I++)) === NEWLINE) eol = true;
            else if (c === RETURN) { eol = true; if (text.charCodeAt(I) === NEWLINE) ++I; }
            return text.slice(j + 1, i - 1).replace(/""/g, "\"");
          }

          // Find next delimiter or newline.
          while (I < N) {
            if ((c = text.charCodeAt(i = I++)) === NEWLINE) eol = true;
            else if (c === RETURN) { eol = true; if (text.charCodeAt(I) === NEWLINE) ++I; }
            else if (c !== DELIMITER) continue;
            return text.slice(j, i);
          }

          // Return last token before EOF.
          return eof = true, text.slice(j, N);
        }

        while ((t = token()) !== EOF) {
          var row = [];
          while (t !== EOL && t !== EOF) row.push(t), t = token();
          if (f && (row = f(row, n++)) == null) continue;
          rows.push(row);
        }

        return rows;
      }

      function preformatBody(rows, columns) {
        return rows.map(function(row) {
          return columns.map(function(column) {
            return formatValue(row[column]);
          }).join(delimiter);
        });
      }

      function format(rows, columns) {
        if (columns == null) columns = inferColumns(rows);
        return [columns.map(formatValue).join(delimiter)].concat(preformatBody(rows, columns)).join("\n");
      }

      function formatBody(rows, columns) {
        if (columns == null) columns = inferColumns(rows);
        return preformatBody(rows, columns).join("\n");
      }

      function formatRows(rows) {
        return rows.map(formatRow).join("\n");
      }

      function formatRow(row) {
        return row.map(formatValue).join(delimiter);
      }

      function formatValue(value) {
        return value == null ? ""
            : value instanceof Date ? formatDate(value)
            : reFormat.test(value += "") ? "\"" + value.replace(/"/g, "\"\"") + "\""
            : value;
      }

      return {
        parse: parse,
        parseRows: parseRows,
        format: format,
        formatBody: formatBody,
        formatRows: formatRows,
        formatRow: formatRow,
        formatValue: formatValue
      };
    }

    var csv = dsv(",");
    var csvFormatRows = csv.formatRows;

    /* src\DownloadData.svelte generated by Svelte v3.16.0 */
    const file$e = "src\\DownloadData.svelte";

    function create_fragment$e(ctx) {
    	let button;
    	let svg;
    	let use;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			svg = svg_element("svg");
    			use = svg_element("use");
    			xlink_attr(use, "xlink:href", "#fa-file-csv");
    			add_location(use, file$e, 113, 4, 3450);
    			attr_dev(svg, "class", "button-icon-svg has-fill-primary");
    			add_location(svg, file$e, 112, 2, 3398);
    			attr_dev(button, "title", "Download Data");
    			attr_dev(button, "class", "button");
    			add_location(button, file$e, 111, 0, 3319);
    			dispose = listen_dev(button, "click", /*handleDownloadData*/ ctx[0], false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, svg);
    			append_dev(svg, use);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$e.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	let { chartType } = $$props;
    	let { projectionStartYear } = $$props;
    	const optionNameToValueLabel = new Map(Array.from(options).map(d => [d[0], new Map(d[1].options.map(e => [e.value, e.label]))]));
    	const projectionWarning = `NOTE: Values after ${projectionStartYear - 1} are projected based on model parameters. Values from ${projectionStartYear - 1} and earlier are based on licensure data.\n`;

    	function makeYearByGroup(callingChart) {
    		const groupingVariable = callingChart == "map" ? "location" : "setting";
    		const valuesToLabels = new Map(options.get(groupingVariable).options.map(d => [d.value, d.label]));

    		const grouped = groups(data.flatMap(e => e.values), d => d[groupingVariable]).map(function (d) {
    			return [valuesToLabels.get(d[0]), ...d[1].map(d => d.value)];
    		}).filter(d => d[0] != undefined);

    		const yearExtent = extent(data[0].values, d => d.year);
    		const yearRange = range(yearExtent[0], yearExtent[1] + 1);
    		const header = data[0].params.map(e => `${options.get(e[0]).label}: ${optionNameToValueLabel.get(e[0]).get(e[1])}`).join("  |  ") + "\n";
    		const firstColumnTitle = options.get(groupingVariable).label;
    		return projectionWarning + header + csvFormatRows([[firstColumnTitle, ...yearRange]].concat(grouped));
    	}

    	function makeYearByProjection() {
    		const maxYearExtent = extent(data.flatMap(d => extent(d.values, e => e.year)));

    		const columns = [
    			...data[0].params.map(d => options.get(d[0]).label),
    			...range(maxYearExtent[0], maxYearExtent[1] + 1)
    		];

    		const rows = data.map(function (d) {
    			const values = d.values.map(e => [e.year, e.value]);
    			const params = d.params.map(e => [options.get(e[0]).label, optionNameToValueLabel.get(e[0]).get(e[1])]);
    			return new Map([...params, ...values]);
    		}).map(function (d) {
    			return columns.map(e => d.get(e) || "");
    		});

    		return projectionWarning + csvFormatRows([columns, ...rows]);
    	}

    	function handleDownloadData() {
    		let download = [];

    		if (chartType == "map" || chartType == "table") {
    			download = makeYearByGroup(chartType);
    		} else {
    			download = makeYearByProjection();
    		}

    		if (navigator.msSaveBlob) {
    			navigator.msSaveBlob(new Blob([download], { type: "text/csv;charset=utf-8;" }), "nurseprojection.csv");
    		} else {
    			var uri = "data:attachment/csv;charset=utf-8," + encodeURI(download);
    			var downloadLink = document.createElement("a");
    			downloadLink.href = uri;
    			downloadLink.download = "nurseprojection.csv";
    			document.body.appendChild(downloadLink);
    			downloadLink.click();
    			document.body.removeChild(downloadLink);
    		}
    	}

    	const writable_props = ["data", "chartType", "projectionStartYear"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<DownloadData> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("data" in $$props) $$invalidate(1, data = $$props.data);
    		if ("chartType" in $$props) $$invalidate(2, chartType = $$props.chartType);
    		if ("projectionStartYear" in $$props) $$invalidate(3, projectionStartYear = $$props.projectionStartYear);
    	};

    	$$self.$capture_state = () => {
    		return { data, chartType, projectionStartYear };
    	};

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(1, data = $$props.data);
    		if ("chartType" in $$props) $$invalidate(2, chartType = $$props.chartType);
    		if ("projectionStartYear" in $$props) $$invalidate(3, projectionStartYear = $$props.projectionStartYear);
    	};

    	return [handleDownloadData, data, chartType, projectionStartYear];
    }

    class DownloadData extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {
    			data: 1,
    			chartType: 2,
    			projectionStartYear: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "DownloadData",
    			options,
    			id: create_fragment$e.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*data*/ ctx[1] === undefined && !("data" in props)) {
    			console.warn("<DownloadData> was created without expected prop 'data'");
    		}

    		if (/*chartType*/ ctx[2] === undefined && !("chartType" in props)) {
    			console.warn("<DownloadData> was created without expected prop 'chartType'");
    		}

    		if (/*projectionStartYear*/ ctx[3] === undefined && !("projectionStartYear" in props)) {
    			console.warn("<DownloadData> was created without expected prop 'projectionStartYear'");
    		}
    	}

    	get data() {
    		throw new Error("<DownloadData>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<DownloadData>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get chartType() {
    		throw new Error("<DownloadData>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set chartType(value) {
    		throw new Error("<DownloadData>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get projectionStartYear() {
    		throw new Error("<DownloadData>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set projectionStartYear(value) {
    		throw new Error("<DownloadData>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    	  path: basedir,
    	  exports: {},
    	  require: function (path, base) {
          return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
        }
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var saveSvgAsPng = createCommonjsModule(function (module, exports) {

    (function () {
      var out$ =  exports || typeof undefined != 'undefined'  || this || window;
      out$.default = out$;

      var xmlNs = 'http://www.w3.org/2000/xmlns/';
      var xhtmlNs = 'http://www.w3.org/1999/xhtml';
      var svgNs = 'http://www.w3.org/2000/svg';
      var doctype = '<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY nbsp "&#160;">]>';
      var urlRegex = /url\(["']?(.+?)["']?\)/;
      var fontFormats = {
        woff2: 'font/woff2',
        woff: 'font/woff',
        otf: 'application/x-font-opentype',
        ttf: 'application/x-font-ttf',
        eot: 'application/vnd.ms-fontobject',
        sfnt: 'application/font-sfnt',
        svg: 'image/svg+xml'
      };

      var isElement = function isElement(obj) {
        return obj instanceof HTMLElement || obj instanceof SVGElement;
      };
      var requireDomNode = function requireDomNode(el) {
        if (!isElement(el)) throw new Error('an HTMLElement or SVGElement is required; got ' + el);
      };
      var requireDomNodePromise = function requireDomNodePromise(el) {
        return new Promise(function (resolve, reject) {
          if (isElement(el)) resolve(el);else reject(new Error('an HTMLElement or SVGElement is required; got ' + el));
        });
      };
      var isExternal = function isExternal(url) {
        return url && url.lastIndexOf('http', 0) === 0 && url.lastIndexOf(window.location.host) === -1;
      };

      var getFontMimeTypeFromUrl = function getFontMimeTypeFromUrl(fontUrl) {
        var formats = Object.keys(fontFormats).filter(function (extension) {
          return fontUrl.indexOf('.' + extension) > 0;
        }).map(function (extension) {
          return fontFormats[extension];
        });
        if (formats) return formats[0];
        console.error('Unknown font format for ' + fontUrl + '. Fonts may not be working correctly.');
        return 'application/octet-stream';
      };

      var arrayBufferToBase64 = function arrayBufferToBase64(buffer) {
        var binary = '';
        var bytes = new Uint8Array(buffer);
        for (var i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }return window.btoa(binary);
      };

      var getDimension = function getDimension(el, clone, dim) {
        var v = el.viewBox && el.viewBox.baseVal && el.viewBox.baseVal[dim] || clone.getAttribute(dim) !== null && !clone.getAttribute(dim).match(/%$/) && parseInt(clone.getAttribute(dim)) || el.getBoundingClientRect()[dim] || parseInt(clone.style[dim]) || parseInt(window.getComputedStyle(el).getPropertyValue(dim));
        return typeof v === 'undefined' || v === null || isNaN(parseFloat(v)) ? 0 : v;
      };

      var getDimensions = function getDimensions(el, clone, width, height) {
        if (el.tagName === 'svg') return {
          width: width || getDimension(el, clone, 'width'),
          height: height || getDimension(el, clone, 'height')
        };else if (el.getBBox) {
          var _el$getBBox = el.getBBox(),
              x = _el$getBBox.x,
              y = _el$getBBox.y,
              _width = _el$getBBox.width,
              _height = _el$getBBox.height;

          return {
            width: x + _width,
            height: y + _height
          };
        }
      };

      var reEncode = function reEncode(data) {
        return decodeURIComponent(encodeURIComponent(data).replace(/%([0-9A-F]{2})/g, function (match, p1) {
          var c = String.fromCharCode('0x' + p1);
          return c === '%' ? '%25' : c;
        }));
      };

      var uriToBlob = function uriToBlob(uri) {
        var byteString = window.atob(uri.split(',')[1]);
        var mimeString = uri.split(',')[0].split(':')[1].split(';')[0];
        var buffer = new ArrayBuffer(byteString.length);
        var intArray = new Uint8Array(buffer);
        for (var i = 0; i < byteString.length; i++) {
          intArray[i] = byteString.charCodeAt(i);
        }
        return new Blob([buffer], { type: mimeString });
      };

      var query = function query(el, selector) {
        if (!selector) return;
        try {
          return el.querySelector(selector) || el.parentNode && el.parentNode.querySelector(selector);
        } catch (err) {
          console.warn('Invalid CSS selector "' + selector + '"', err);
        }
      };

      var detectCssFont = function detectCssFont(rule, href) {
        // Match CSS font-face rules to external links.
        // @font-face {
        //   src: local('Abel'), url(https://fonts.gstatic.com/s/abel/v6/UzN-iejR1VoXU2Oc-7LsbvesZW2xOQ-xsNqO47m55DA.woff2);
        // }
        var match = rule.cssText.match(urlRegex);
        var url = match && match[1] || '';
        if (!url || url.match(/^data:/) || url === 'about:blank') return;
        var fullUrl = url.startsWith('../') ? href + '/../' + url : url.startsWith('./') ? href + '/.' + url : url;
        return {
          text: rule.cssText,
          format: getFontMimeTypeFromUrl(fullUrl),
          url: fullUrl
        };
      };

      var inlineImages = function inlineImages(el) {
        return Promise.all(Array.from(el.querySelectorAll('image')).map(function (image) {
          var href = image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || image.getAttribute('href');
          if (!href) return Promise.resolve(null);
          if (isExternal(href)) {
            href += (href.indexOf('?') === -1 ? '?' : '&') + 't=' + new Date().valueOf();
          }
          return new Promise(function (resolve, reject) {
            var canvas = document.createElement('canvas');
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = href;
            img.onerror = function () {
              return reject(new Error('Could not load ' + href));
            };
            img.onload = function () {
              canvas.width = img.width;
              canvas.height = img.height;
              canvas.getContext('2d').drawImage(img, 0, 0);
              image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', canvas.toDataURL('image/png'));
              resolve(true);
            };
          });
        }));
      };

      var cachedFonts = {};
      var inlineFonts = function inlineFonts(fonts) {
        return Promise.all(fonts.map(function (font) {
          return new Promise(function (resolve, reject) {
            if (cachedFonts[font.url]) return resolve(cachedFonts[font.url]);

            var req = new XMLHttpRequest();
            req.addEventListener('load', function () {
              // TODO: it may also be worth it to wait until fonts are fully loaded before
              // attempting to rasterize them. (e.g. use https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet)
              var fontInBase64 = arrayBufferToBase64(req.response);
              var fontUri = font.text.replace(urlRegex, 'url("data:' + font.format + ';base64,' + fontInBase64 + '")') + '\n';
              cachedFonts[font.url] = fontUri;
              resolve(fontUri);
            });
            req.addEventListener('error', function (e) {
              console.warn('Failed to load font from: ' + font.url, e);
              cachedFonts[font.url] = null;
              resolve(null);
            });
            req.addEventListener('abort', function (e) {
              console.warn('Aborted loading font from: ' + font.url, e);
              resolve(null);
            });
            req.open('GET', font.url);
            req.responseType = 'arraybuffer';
            req.send();
          });
        })).then(function (fontCss) {
          return fontCss.filter(function (x) {
            return x;
          }).join('');
        });
      };

      var cachedRules = null;
      var styleSheetRules = function styleSheetRules() {
        if (cachedRules) return cachedRules;
        return cachedRules = Array.from(document.styleSheets).map(function (sheet) {
          try {
            return { rules: sheet.cssRules, href: sheet.href };
          } catch (e) {
            console.warn('Stylesheet could not be loaded: ' + sheet.href, e);
            return {};
          }
        });
      };

      var inlineCss = function inlineCss(el, options) {
        var _ref = options || {},
            selectorRemap = _ref.selectorRemap,
            modifyStyle = _ref.modifyStyle,
            modifyCss = _ref.modifyCss,
            fonts = _ref.fonts,
            excludeUnusedCss = _ref.excludeUnusedCss;

        var generateCss = modifyCss || function (selector, properties) {
          var sel = selectorRemap ? selectorRemap(selector) : selector;
          var props = modifyStyle ? modifyStyle(properties) : properties;
          return sel + '{' + props + '}\n';
        };
        var css = [];
        var detectFonts = typeof fonts === 'undefined';
        var fontList = fonts || [];
        styleSheetRules().forEach(function (_ref2) {
          var rules = _ref2.rules,
              href = _ref2.href;

          if (!rules) return;
          Array.from(rules).forEach(function (rule) {
            if (typeof rule.style != 'undefined') {
              if (query(el, rule.selectorText)) css.push(generateCss(rule.selectorText, rule.style.cssText));else if (detectFonts && rule.cssText.match(/^@font-face/)) {
                var font = detectCssFont(rule, href);
                if (font) fontList.push(font);
              } else if (!excludeUnusedCss) {
                css.push(rule.cssText);
              }
            }
          });
        });

        return inlineFonts(fontList).then(function (fontCss) {
          return css.join('\n') + fontCss;
        });
      };

      var downloadOptions = function downloadOptions() {
        if (!navigator.msSaveOrOpenBlob && !('download' in document.createElement('a'))) {
          return { popup: window.open() };
        }
      };

      out$.prepareSvg = function (el, options, done) {
        requireDomNode(el);

        var _ref3 = options || {},
            _ref3$left = _ref3.left,
            left = _ref3$left === undefined ? 0 : _ref3$left,
            _ref3$top = _ref3.top,
            top = _ref3$top === undefined ? 0 : _ref3$top,
            w = _ref3.width,
            h = _ref3.height,
            _ref3$scale = _ref3.scale,
            scale = _ref3$scale === undefined ? 1 : _ref3$scale,
            _ref3$responsive = _ref3.responsive,
            responsive = _ref3$responsive === undefined ? false : _ref3$responsive,
            _ref3$excludeCss = _ref3.excludeCss,
            excludeCss = _ref3$excludeCss === undefined ? false : _ref3$excludeCss;

        return inlineImages(el).then(function () {
          var clone = el.cloneNode(true);
          clone.style.backgroundColor = (options || {}).backgroundColor || el.style.backgroundColor;

          var _getDimensions = getDimensions(el, clone, w, h),
              width = _getDimensions.width,
              height = _getDimensions.height;

          if (el.tagName !== 'svg') {
            if (el.getBBox) {
              if (clone.getAttribute('transform') != null) {
                clone.setAttribute('transform', clone.getAttribute('transform').replace(/translate\(.*?\)/, ''));
              }
              var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              svg.appendChild(clone);
              clone = svg;
            } else {
              console.error('Attempted to render non-SVG element', el);
              return;
            }
          }

          clone.setAttribute('version', '1.1');
          clone.setAttribute('viewBox', [left, top, width, height].join(' '));
          if (!clone.getAttribute('xmlns')) clone.setAttributeNS(xmlNs, 'xmlns', svgNs);
          if (!clone.getAttribute('xmlns:xlink')) clone.setAttributeNS(xmlNs, 'xmlns:xlink', 'http://www.w3.org/1999/xlink');

          if (responsive) {
            clone.removeAttribute('width');
            clone.removeAttribute('height');
            clone.setAttribute('preserveAspectRatio', 'xMinYMin meet');
          } else {
            clone.setAttribute('width', width * scale);
            clone.setAttribute('height', height * scale);
          }

          Array.from(clone.querySelectorAll('foreignObject > *')).forEach(function (foreignObject) {
            foreignObject.setAttributeNS(xmlNs, 'xmlns', foreignObject.tagName === 'svg' ? svgNs : xhtmlNs);
          });

          if (excludeCss) {
            var outer = document.createElement('div');
            outer.appendChild(clone);
            var src = outer.innerHTML;
            if (typeof done === 'function') done(src, width, height);else return { src: src, width: width, height: height };
          } else {
            return inlineCss(el, options).then(function (css) {
              var style = document.createElement('style');
              style.setAttribute('type', 'text/css');
              style.innerHTML = '<![CDATA[\n' + css + '\n]]>';

              var defs = document.createElement('defs');
              defs.appendChild(style);
              clone.insertBefore(defs, clone.firstChild);

              var outer = document.createElement('div');
              outer.appendChild(clone);
              var src = outer.innerHTML.replace(/NS\d+:href/gi, 'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href');

              if (typeof done === 'function') done(src, width, height);else return { src: src, width: width, height: height };
            });
          }
        });
      };

      out$.svgAsDataUri = function (el, options, done) {
        requireDomNode(el);
        return out$.prepareSvg(el, options).then(function (_ref4) {
          var src = _ref4.src,
              width = _ref4.width,
              height = _ref4.height;

          var svgXml = 'data:image/svg+xml;base64,' + window.btoa(reEncode(doctype + src));
          if (typeof done === 'function') {
            done(svgXml, width, height);
          }
          return svgXml;
        });
      };

      out$.svgAsPngUri = function (el, options, done) {
        requireDomNode(el);

        var _ref5 = options || {},
            _ref5$encoderType = _ref5.encoderType,
            encoderType = _ref5$encoderType === undefined ? 'image/png' : _ref5$encoderType,
            _ref5$encoderOptions = _ref5.encoderOptions,
            encoderOptions = _ref5$encoderOptions === undefined ? 0.8 : _ref5$encoderOptions,
            canvg = _ref5.canvg;

        var convertToPng = function convertToPng(_ref6) {
          var src = _ref6.src,
              width = _ref6.width,
              height = _ref6.height;

          var canvas = document.createElement('canvas');
          var context = canvas.getContext('2d');
          var pixelRatio = window.devicePixelRatio || 1;

          canvas.width = width * pixelRatio;
          canvas.height = height * pixelRatio;
          canvas.style.width = canvas.width + 'px';
          canvas.style.height = canvas.height + 'px';
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

          if (canvg) canvg(canvas, src);else context.drawImage(src, 0, 0);

          var png = void 0;
          try {
            png = canvas.toDataURL(encoderType, encoderOptions);
          } catch (e) {
            if (typeof SecurityError !== 'undefined' && e instanceof SecurityError || e.name === 'SecurityError') {
              console.error('Rendered SVG images cannot be downloaded in this browser.');
              return;
            } else throw e;
          }
          if (typeof done === 'function') done(png, canvas.width, canvas.height);
          return Promise.resolve(png);
        };

        if (canvg) return out$.prepareSvg(el, options).then(convertToPng);else return out$.svgAsDataUri(el, options).then(function (uri) {
          return new Promise(function (resolve, reject) {
            var image = new Image();
            image.onload = function () {
              return resolve(convertToPng({
                src: image,
                width: image.width,
                height: image.height
              }));
            };
            image.onerror = function () {
              reject('There was an error loading the data URI as an image on the following SVG\n' + window.atob(uri.slice(26)) + 'Open the following link to see browser\'s diagnosis\n' + uri);
            };
            image.src = uri;
          });
        });
      };

      out$.download = function (name, uri, options) {
        if (navigator.msSaveOrOpenBlob) navigator.msSaveOrOpenBlob(uriToBlob(uri), name);else {
          var saveLink = document.createElement('a');
          if ('download' in saveLink) {
            saveLink.download = name;
            saveLink.style.display = 'none';
            document.body.appendChild(saveLink);
            try {
              var blob = uriToBlob(uri);
              var url = URL.createObjectURL(blob);
              saveLink.href = url;
              saveLink.onclick = function () {
                return requestAnimationFrame(function () {
                  return URL.revokeObjectURL(url);
                });
              };
            } catch (e) {
              console.error(e);
              console.warn('Error while getting object URL. Falling back to string URL.');
              saveLink.href = uri;
            }
            saveLink.click();
            document.body.removeChild(saveLink);
          } else if (options && options.popup) {
            options.popup.document.title = name;
            options.popup.location.replace(uri);
          }
        }
      };

      out$.saveSvg = function (el, name, options) {
        var downloadOpts = downloadOptions(); // don't inline, can't be async
        return requireDomNodePromise(el).then(function (el) {
          return out$.svgAsDataUri(el, options || {});
        }).then(function (uri) {
          return out$.download(name, uri, downloadOpts);
        });
      };

      out$.saveSvgAsPng = function (el, name, options) {
        var downloadOpts = downloadOptions(); // don't inline, can't be async
        return requireDomNodePromise(el).then(function (el) {
          return out$.svgAsPngUri(el, options || {});
        }).then(function (uri) {
          return out$.download(name, uri, downloadOpts);
        });
      };
    })();
    });

    /* src\DownloadImage.svelte generated by Svelte v3.16.0 */
    const file$f = "src\\DownloadImage.svelte";

    function create_fragment$f(ctx) {
    	let button;
    	let svg;
    	let use;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			svg = svg_element("svg");
    			use = svg_element("use");
    			xlink_attr(use, "xlink:href", "#fa-image");
    			add_location(use, file$f, 299, 4, 9590);
    			attr_dev(svg, "class", "button-icon-svg has-fill-primary");
    			add_location(svg, file$f, 298, 2, 9538);
    			attr_dev(button, "title", "Save Image");
    			attr_dev(button, "class", "button");
    			add_location(button, file$f, 297, 0, 9465);
    			dispose = listen_dev(button, "click", /*handleSaveImage*/ ctx[0], false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, svg);
    			append_dev(svg, use);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$f.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function generateLineChartImage() {
    	const div = document.getElementById("line-chart-div");
    	const title = div.querySelector(".title").innerText;
    	const subtitle = div.querySelector(".subtitle").innerText;
    	const lineChartHeight = 580;
    	const tablePadding = 40;
    	const width = 960;
    	const legendTable = document.getElementById("line-chart-table");
    	const tableFontFill = "#6C7480";

    	const tableHeader = {
    		cells: Array.from(legendTable.querySelector("thead").querySelectorAll("th"), function (d) {
    			const svgText = createSVGtext({
    				text: d.innerText,
    				fill: tableFontFill,
    				maxCharsPerLine: 14
    			});

    			return { text: d.innerText, isBold: true, svgText };
    		}).slice(1),
    		type: "header",
    		color: "none"
    	};

    	const tableBody = Array.from(legendTable.querySelector("tbody").querySelectorAll("tr"), function (d) {
    		const columns = Array.from(d.children, function (e, i) {
    			if (i == 0) {
    				return e.style.backgroundColor;
    			}

    			const svgText = createSVGtext({
    				text: e.innerText,
    				fill: tableFontFill,
    				maxCharsPerLine: 14
    			});

    			return {
    				text: e.innerText,
    				isBold: e.classList.value.indexOf("has-text-weight-bold") >= 0,
    				svgText
    			};
    		});

    		return {
    			cells: columns.slice(1),
    			color: columns[0],
    			type: "body"
    		};
    	});

    	const tableRows = [tableHeader, ...tableBody];
    	const tableGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    	tableGroup.setAttributeNS(null, "transform", `translate(20, ${lineChartHeight + tablePadding})`);
    	tableGroup.setAttributeNS(null, "fill", tableFontFill);
    	const lineHeight = 17;
    	const rowHeight = max(tableBody, d => max(d.cells, e => e.svgText.childElementCount)) * lineHeight;
    	const headerHeight = max(tableHeader.cells, e => e.svgText.childElementCount) * lineHeight;
    	const rectWidth = 15;
    	const colWidth = (width - 40) / tableRows[0].cells.length - rectWidth;

    	tableRows.forEach(function (d, i) {
    		const row = document.createElementNS("http://www.w3.org/2000/svg", "g");
    		row.setAttributeNS(null, "transform", `translate(0, ${i == 0 ? 0 : headerHeight + rowHeight * (i - 1)})`);
    		const colorRectangle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    		colorRectangle.setAttributeNS(null, "width", rectWidth);
    		colorRectangle.setAttributeNS(null, "height", rowHeight);
    		colorRectangle.setAttributeNS(null, "fill", d.color);
    		colorRectangle.setAttributeNS(null, "transform", `translate(${-rectWidth - 3}, -12)`);
    		row.append(colorRectangle);

    		d.cells.forEach(function (e, j) {
    			e.svgText.setAttributeNS(null, "font-size", "12px");
    			e.svgText.setAttributeNS(null, "transform", `translate(${j * colWidth},0)`);

    			if (e.isBold) {
    				e.svgText.setAttributeNS(null, "font-weight", 600);
    			}

    			row.appendChild(e.svgText);
    		});

    		const ledger = document.createElementNS("http://www.w3.org/2000/svg", "line");
    		ledger.setAttributeNS(null, "x2", colWidth * d.cells.length);
    		ledger.setAttributeNS(null, "transform", `translate(0, ${i == 0 ? headerHeight - 12 : rowHeight - 12})`);
    		ledger.setAttributeNS(null, "stroke", tableFontFill);

    		if (i == 0) {
    			ledger.setAttributeNS(null, "stroke-width", 2);
    		}

    		row.appendChild(ledger);
    		tableGroup.appendChild(row);
    	});

    	const height = lineChartHeight + tableRows.length * rowHeight + 2 * tablePadding;
    	const svg = document.getElementById("line-chart-svg").cloneNode(true);
    	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    	svg.style.fontFamily = "Helvetica, Arial, sans-serif";
    	svg.querySelector(".chart-container").setAttribute("transform", "translate(20, 100)");
    	const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    	titleText.setAttributeNS(null, "font-size", "30px");
    	titleText.setAttributeNS(null, "transform", `translate(40,50)`);
    	titleText.innerHTML = title;
    	const subtitleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    	subtitleText.setAttributeNS(null, "font-size", "20px");
    	subtitleText.setAttributeNS(null, "transform", `translate(40,80)`);
    	subtitleText.innerHTML = subtitle;
    	const sourceText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    	sourceText.setAttributeNS(null, "font-size", "12px");
    	sourceText.setAttributeNS(null, "transform", `translate(40,${height - 20})`);
    	sourceText.innerHTML = "See more at " + window.location.href;
    	svg.appendChild(titleText);
    	svg.appendChild(subtitleText);
    	svg.appendChild(tableGroup);
    	svg.appendChild(sourceText);
    	saveSvgAsPng.saveSvgAsPng(svg, "nurse_line_chart.png", { backgroundColor: "#fff", scale: 2 });
    }

    function generateMapImage() {
    	const div = document.getElementById("simple-map-container");
    	const title = div.querySelector(".title").innerText;
    	const subtitle = div.querySelector(".subtitle").innerText;
    	const svg = document.getElementById("map-svg").cloneNode(true);
    	const chartGroup = document.getElementById("row-chart-svg").firstChild.cloneNode(true);
    	const rowChartElementCount = chartGroup.querySelectorAll("rect").length;
    	const width = 1100;
    	const height = Math.max(450, 200 + rowChartElementCount * 50);
    	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    	svg.style.fontFamily = "Helvetica, Arial, sans-serif";
    	svg.firstChild.setAttributeNS(null, "transform", `translate(630,200) scale(1.4)`);
    	chartGroup.setAttributeNS(null, "transform", `translate(0, 140) scale(2)`);
    	chartGroup.setAttributeNS(null, "font-size", "10px");
    	svg.appendChild(chartGroup);
    	const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    	titleText.setAttributeNS(null, "font-size", "42px");
    	titleText.setAttributeNS(null, "transform", `translate(20,60)`);
    	titleText.innerHTML = title;

    	const subtitleText = createSVGtext({
    		text: subtitle,
    		x: 20,
    		y: 90,
    		fontSize: 20,
    		maxCharsPerLine: 100
    	});

    	const sourceText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    	sourceText.setAttributeNS(null, "font-size", "12px");
    	sourceText.setAttributeNS(null, "transform", `translate(40,${height - 20})`);
    	sourceText.innerHTML = "See more at " + window.location.href;
    	svg.appendChild(titleText);
    	svg.appendChild(subtitleText);
    	svg.appendChild(sourceText);
    	saveSvgAsPng.saveSvgAsPng(svg, "nurse_projection_map.png", { backgroundColor: "#fff" });
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let { chartType } = $$props;

    	function handleSaveImage() {
    		if (chartType == "line") {
    			generateLineChartImage();
    		} else if (chartType == "map") {
    			generateMapImage();
    		}
    	}

    	const writable_props = ["chartType"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<DownloadImage> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("chartType" in $$props) $$invalidate(1, chartType = $$props.chartType);
    	};

    	$$self.$capture_state = () => {
    		return { chartType };
    	};

    	$$self.$inject_state = $$props => {
    		if ("chartType" in $$props) $$invalidate(1, chartType = $$props.chartType);
    	};

    	return [handleSaveImage, chartType];
    }

    class DownloadImage extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, { chartType: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "DownloadImage",
    			options,
    			id: create_fragment$f.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*chartType*/ ctx[1] === undefined && !("chartType" in props)) {
    			console.warn("<DownloadImage> was created without expected prop 'chartType'");
    		}
    	}

    	get chartType() {
    		throw new Error("<DownloadImage>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set chartType(value) {
    		throw new Error("<DownloadImage>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\IntroBlock.svelte generated by Svelte v3.16.0 */
    const file$g = "src\\IntroBlock.svelte";

    // (85:2) {:else}
    function create_else_block$5(ctx) {
    	let h2;
    	let t0;
    	let button;
    	let dispose;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			t0 = text("Select a chart type and projection options, or launch our tutorial to\r\n      learn more!\r\n      ");
    			button = element("button");
    			button.textContent = "Launch User Guide";
    			attr_dev(button, "class", "button is-primary is-outlined is-center is-rounded");
    			attr_dev(button, "id", "btn");
    			add_location(button, file$g, 88, 6, 2950);
    			attr_dev(h2, "class", "subtitle is-size-5 has-text-grey-dark");
    			add_location(h2, file$g, 85, 4, 2796);
    			dispose = listen_dev(button, "click", /*handleLaunchTutorial*/ ctx[1], false, false, false);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			append_dev(h2, t0);
    			append_dev(h2, button);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$5.name,
    		type: "else",
    		source: "(85:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (67:33) 
    function create_if_block_2$5(ctx) {
    	let h2;
    	let t1;
    	let p;
    	let span0;
    	let t3;
    	let span1;
    	let t5;
    	let span2;
    	let t7;
    	let t8;
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "You can create a table.";
    			t1 = space();
    			p = element("p");
    			span0 = element("span");
    			span0.textContent = "You can also view projections in a table.";
    			t3 = text("\r\n      The colors represent the change relative to the baseline (the first year,\r\n      in this case, 2008).\r\n      ");
    			span1 = element("span");
    			span1.textContent = "Red";
    			t5 = text("\r\n      indicates a decrease from the baseline.\r\n      ");
    			span2 = element("span");
    			span2.textContent = "Blue";
    			t7 = text("\r\n      indicates an increase from the baseline. The table can be downloaded as a\r\n      CSV file.");
    			t8 = space();
    			img = element("img");
    			add_location(h2, file$g, 67, 4, 2155);
    			attr_dev(span0, "class", "has-text-weight-semibold");
    			add_location(span0, file$g, 69, 6, 2204);
    			set_style(span1, "color", "red");
    			add_location(span1, file$g, 74, 6, 2426);
    			set_style(span2, "color", "blue");
    			add_location(span2, file$g, 76, 6, 2516);
    			add_location(p, file$g, 68, 4, 2193);
    			attr_dev(img, "class", "image");
    			attr_dev(img, "alt", "How to use the table.");
    			if (img.src !== (img_src_value = "public/images/tutorial/06_table.png")) attr_dev(img, "src", img_src_value);
    			add_location(img, file$g, 80, 4, 2667);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p, anchor);
    			append_dev(p, span0);
    			append_dev(p, t3);
    			append_dev(p, span1);
    			append_dev(p, t5);
    			append_dev(p, span2);
    			append_dev(p, t7);
    			insert_dev(target, t8, anchor);
    			insert_dev(target, img, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p);
    			if (detaching) detach_dev(t8);
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$5.name,
    		type: "if",
    		source: "(67:33) ",
    		ctx
    	});

    	return block;
    }

    // (54:31) 
    function create_if_block_1$5(ctx) {
    	let h2;
    	let t1;
    	let p;
    	let span;
    	let t3;
    	let t4;
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "You can create a map.";
    			t1 = space();
    			p = element("p");
    			span = element("span");
    			span.textContent = "You can also view projections as a map.";
    			t3 = text("\r\n      Use the slider below the map to change the year of data. The maps are\r\n      color-coded to indicate the location of each area.");
    			t4 = space();
    			img = element("img");
    			add_location(h2, file$g, 54, 4, 1705);
    			attr_dev(span, "class", "has-text-weight-semibold");
    			add_location(span, file$g, 56, 6, 1752);
    			add_location(p, file$g, 55, 4, 1741);
    			attr_dev(img, "class", "image");
    			attr_dev(img, "alt", "How to use the map.");
    			if (img.src !== (img_src_value = "public/images/tutorial/05_map.png")) attr_dev(img, "src", img_src_value);
    			add_location(img, file$g, 62, 4, 2006);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p, anchor);
    			append_dev(p, span);
    			append_dev(p, t3);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, img, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$5.name,
    		type: "if",
    		source: "(54:31) ",
    		ctx
    	});

    	return block;
    }

    // (23:2) {#if chartType == 'line'}
    function create_if_block$7(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let span0;
    	let t3;
    	let span1;
    	let t5;
    	let span2;
    	let t7;
    	let t8;
    	let img;
    	let img_src_value;
    	let t9;
    	let hr;
    	let t10;
    	let p1;
    	let span3;
    	let t12;
    	let t13;
    	let p2;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "You can create a line chart.";
    			t1 = space();
    			p0 = element("p");
    			span0 = element("span");
    			span0.textContent = "If you are using the line chart option,";
    			t3 = text("\r\n      you can display multiple lines at once to compare. Just change your\r\n      options and select\r\n      ");
    			span1 = element("span");
    			span1.textContent = "Show";
    			t5 = text("\r\n      again. To remove a line, hit the\r\n      ");
    			span2 = element("span");
    			span2.textContent = "X";
    			t7 = text("\r\n      button in the top left of its corresponding box. Once you have displayed\r\n      the projections* you are interested in, you can download the image (as a\r\n      PNG) or the data (as a CSV file).");
    			t8 = space();
    			img = element("img");
    			t9 = space();
    			hr = element("hr");
    			t10 = space();
    			p1 = element("p");
    			span3 = element("span");
    			span3.textContent = "Please note:";
    			t12 = text("\r\n      the model won’t allow you to display the projections for specific\r\n      education categories combined with specific settings at the same time. For\r\n      instance, the projection for RN, with BS for education, and hospital for\r\n      setting is not available. This is because the numbers are small.");
    			t13 = space();
    			p2 = element("p");
    			p2.textContent = "*The projection line does include some historical data, but projections\r\n      are delineated by gray.";
    			add_location(h2, file$g, 23, 4, 403);
    			attr_dev(span0, "class", "has-text-weight-semibold");
    			add_location(span0, file$g, 25, 6, 457);
    			attr_dev(span1, "class", "is-family-code");
    			add_location(span1, file$g, 30, 6, 669);
    			attr_dev(span2, "class", "is-family-code");
    			add_location(span2, file$g, 32, 6, 757);
    			add_location(p0, file$g, 24, 4, 446);
    			attr_dev(img, "class", "image");
    			attr_dev(img, "alt", "How to use the line chart.");
    			if (img.src !== (img_src_value = "public/images/tutorial/03_line_chart.png")) attr_dev(img, "src", img_src_value);
    			add_location(img, file$g, 37, 4, 1011);
    			add_location(hr, file$g, 41, 4, 1139);
    			attr_dev(span3, "class", "has-text-weight-semibold");
    			add_location(span3, file$g, 43, 6, 1162);
    			add_location(p1, file$g, 42, 4, 1151);
    			add_location(p2, file$g, 49, 4, 1543);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p0, anchor);
    			append_dev(p0, span0);
    			append_dev(p0, t3);
    			append_dev(p0, span1);
    			append_dev(p0, t5);
    			append_dev(p0, span2);
    			append_dev(p0, t7);
    			insert_dev(target, t8, anchor);
    			insert_dev(target, img, anchor);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, hr, anchor);
    			insert_dev(target, t10, anchor);
    			insert_dev(target, p1, anchor);
    			append_dev(p1, span3);
    			append_dev(p1, t12);
    			insert_dev(target, t13, anchor);
    			insert_dev(target, p2, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p0);
    			if (detaching) detach_dev(t8);
    			if (detaching) detach_dev(img);
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(hr);
    			if (detaching) detach_dev(t10);
    			if (detaching) detach_dev(p1);
    			if (detaching) detach_dev(t13);
    			if (detaching) detach_dev(p2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$7.name,
    		type: "if",
    		source: "(23:2) {#if chartType == 'line'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$g(ctx) {
    	let div;

    	function select_block_type(ctx, dirty) {
    		if (/*chartType*/ ctx[0] == "line") return create_if_block$7;
    		if (/*chartType*/ ctx[0] == "map") return create_if_block_1$5;
    		if (/*chartType*/ ctx[0] == "table") return create_if_block_2$5;
    		return create_else_block$5;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "class", "content has-background-light svelte-1v58ua5");
    			add_location(div, file$g, 20, 0, 324);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_block.m(div, null);
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$g.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$g($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { chartType } = $$props;

    	function handleLaunchTutorial() {
    		dispatch("launchTutorial");
    	}

    	const writable_props = ["chartType"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<IntroBlock> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("chartType" in $$props) $$invalidate(0, chartType = $$props.chartType);
    	};

    	$$self.$capture_state = () => {
    		return { chartType };
    	};

    	$$self.$inject_state = $$props => {
    		if ("chartType" in $$props) $$invalidate(0, chartType = $$props.chartType);
    	};

    	return [chartType, handleLaunchTutorial];
    }

    class IntroBlock extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$g, create_fragment$g, safe_not_equal, { chartType: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "IntroBlock",
    			options,
    			id: create_fragment$g.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*chartType*/ ctx[0] === undefined && !("chartType" in props)) {
    			console.warn("<IntroBlock> was created without expected prop 'chartType'");
    		}
    	}

    	get chartType() {
    		throw new Error("<IntroBlock>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set chartType(value) {
    		throw new Error("<IntroBlock>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\TutorialImage.svelte generated by Svelte v3.16.0 */

    const file$h = "src\\TutorialImage.svelte";

    function create_fragment$h(ctx) {
    	let div;
    	let t0;
    	let img;
    	let img_src_value;
    	let t1;
    	let hr;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[2].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], null);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			t0 = space();
    			img = element("img");
    			t1 = space();
    			hr = element("hr");
    			attr_dev(img, "class", "image");
    			attr_dev(img, "alt", "Chart tutorial.");
    			if (img.src !== (img_src_value = "public/images/tutorial/" + /*imageFileName*/ ctx[0])) attr_dev(img, "src", img_src_value);
    			add_location(img, file$h, 6, 2, 73);
    			add_location(hr, file$h, 10, 2, 180);
    			add_location(div, file$h, 4, 0, 52);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			append_dev(div, t0);
    			append_dev(div, img);
    			append_dev(div, t1);
    			append_dev(div, hr);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 2) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[1], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[1], dirty, null));
    			}

    			if (!current || dirty & /*imageFileName*/ 1 && img.src !== (img_src_value = "public/images/tutorial/" + /*imageFileName*/ ctx[0])) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$h.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { imageFileName } = $$props;
    	const writable_props = ["imageFileName"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TutorialImage> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ("imageFileName" in $$props) $$invalidate(0, imageFileName = $$props.imageFileName);
    		if ("$$scope" in $$props) $$invalidate(1, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => {
    		return { imageFileName };
    	};

    	$$self.$inject_state = $$props => {
    		if ("imageFileName" in $$props) $$invalidate(0, imageFileName = $$props.imageFileName);
    	};

    	return [imageFileName, $$scope, $$slots];
    }

    class TutorialImage extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, { imageFileName: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TutorialImage",
    			options,
    			id: create_fragment$h.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*imageFileName*/ ctx[0] === undefined && !("imageFileName" in props)) {
    			console.warn("<TutorialImage> was created without expected prop 'imageFileName'");
    		}
    	}

    	get imageFileName() {
    		throw new Error("<TutorialImage>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set imageFileName(value) {
    		throw new Error("<TutorialImage>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\TutorialModal.svelte generated by Svelte v3.16.0 */
    const file$i = "src\\TutorialModal.svelte";

    // (35:6) <TutorialImage imageFileName={images[0]}>
    function create_default_slot_5(ctx) {
    	let p;
    	let span;

    	const block = {
    		c: function create() {
    			p = element("p");
    			span = element("span");
    			span.textContent = "Select whether you would like to view the data as a line chart, map\r\n            or table.";
    			attr_dev(span, "class", "has-text-weight-semibold");
    			add_location(span, file$i, 36, 10, 948);
    			add_location(p, file$i, 35, 8, 933);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, span);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_5.name,
    		type: "slot",
    		source: "(35:6) <TutorialImage imageFileName={images[0]}>",
    		ctx
    	});

    	return block;
    }

    // (43:6) <TutorialImage imageFileName={images[1]}>
    function create_default_slot_4(ctx) {
    	let p;
    	let span0;
    	let t1;
    	let span1;
    	let t3;
    	let span2;
    	let t5;

    	const block = {
    		c: function create() {
    			p = element("p");
    			span0 = element("span");
    			span0.textContent = "Use the radio buttons to choose the parameters for the projection\r\n            you would like to view.";
    			t1 = text("\r\n          Select the\r\n          ");
    			span1 = element("span");
    			span1.textContent = "i";
    			t3 = text("\r\n          icon to learn more about each option. Then, select\r\n          ");
    			span2 = element("span");
    			span2.textContent = "Show";
    			t5 = text("\r\n          to display the line chart, map or table.");
    			attr_dev(span0, "class", "has-text-weight-semibold");
    			add_location(span0, file$i, 44, 10, 1222);
    			attr_dev(span1, "class", "is-family-code svelte-pf1nls");
    			add_location(span1, file$i, 49, 10, 1430);
    			attr_dev(span2, "class", "is-family-code svelte-pf1nls");
    			add_location(span2, file$i, 51, 10, 1541);
    			add_location(p, file$i, 43, 8, 1207);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, span0);
    			append_dev(p, t1);
    			append_dev(p, span1);
    			append_dev(p, t3);
    			append_dev(p, span2);
    			append_dev(p, t5);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(43:6) <TutorialImage imageFileName={images[1]}>",
    		ctx
    	});

    	return block;
    }

    // (56:6) <TutorialImage imageFileName={images[2]}>
    function create_default_slot_3$1(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let span0;
    	let t3;
    	let span1;
    	let t5;
    	let span2;
    	let t7;
    	let t8;
    	let p1;
    	let span3;
    	let t10;
    	let t11;
    	let p2;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Using the line chart function";
    			t1 = space();
    			p0 = element("p");
    			span0 = element("span");
    			span0.textContent = "If you are using the line chart option,";
    			t3 = text("\r\n          you can display multiple lines at once to compare. Just change your\r\n          options and select\r\n          ");
    			span1 = element("span");
    			span1.textContent = "Show";
    			t5 = text("\r\n          again. To remove a line, hit the\r\n          ");
    			span2 = element("span");
    			span2.textContent = "X";
    			t7 = text("\r\n          button in the top left of its corresponding box. Once you have\r\n          displayed the projections* you are interested in, you can download the\r\n          image (as a PNG) or the data (as a CSV file).");
    			t8 = space();
    			p1 = element("p");
    			span3 = element("span");
    			span3.textContent = "Please note:";
    			t10 = text("\r\n          the model won’t allow you to display the projections for specific\r\n          education categories combined with specific settings at the same time.\r\n          For instance, the projection for RN, with BS for education, and\r\n          hospital for setting is not available. This is because the numbers are\r\n          small.");
    			t11 = space();
    			p2 = element("p");
    			p2.textContent = "*The projection line does include some historical data, but\r\n          projections are delineated by gray.";
    			add_location(h2, file$i, 57, 8, 1732);
    			attr_dev(span0, "class", "has-text-weight-semibold");
    			add_location(span0, file$i, 59, 10, 1795);
    			attr_dev(span1, "class", "is-family-code svelte-pf1nls");
    			add_location(span1, file$i, 64, 10, 2027);
    			attr_dev(span2, "class", "is-family-code svelte-pf1nls");
    			add_location(span2, file$i, 66, 10, 2123);
    			add_location(p0, file$i, 58, 8, 1780);
    			attr_dev(span3, "class", "has-text-weight-semibold");
    			add_location(span3, file$i, 72, 10, 2412);
    			add_location(p1, file$i, 71, 8, 2397);
    			add_location(p2, file$i, 79, 8, 2828);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p0, anchor);
    			append_dev(p0, span0);
    			append_dev(p0, t3);
    			append_dev(p0, span1);
    			append_dev(p0, t5);
    			append_dev(p0, span2);
    			append_dev(p0, t7);
    			insert_dev(target, t8, anchor);
    			insert_dev(target, p1, anchor);
    			append_dev(p1, span3);
    			append_dev(p1, t10);
    			insert_dev(target, t11, anchor);
    			insert_dev(target, p2, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p0);
    			if (detaching) detach_dev(t8);
    			if (detaching) detach_dev(p1);
    			if (detaching) detach_dev(t11);
    			if (detaching) detach_dev(p2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3$1.name,
    		type: "slot",
    		source: "(56:6) <TutorialImage imageFileName={images[2]}>",
    		ctx
    	});

    	return block;
    }

    // (85:6) <TutorialImage imageFileName={images[3]}>
    function create_default_slot_2$1(ctx) {
    	let p;
    	let span1;
    	let t0;
    	let span0;
    	let t2;

    	const block = {
    		c: function create() {
    			p = element("p");
    			span1 = element("span");
    			t0 = text("To remove all lines and reset the visualization, select the\r\n            ");
    			span0 = element("span");
    			span0.textContent = "Clear";
    			t2 = text("\r\n            button.");
    			attr_dev(span0, "class", "is-family-code svelte-pf1nls");
    			add_location(span0, file$i, 88, 12, 3187);
    			attr_dev(span1, "class", "has-text-weight-semibold");
    			add_location(span1, file$i, 86, 10, 3061);
    			add_location(p, file$i, 85, 8, 3046);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, span1);
    			append_dev(span1, t0);
    			append_dev(span1, span0);
    			append_dev(span1, t2);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$1.name,
    		type: "slot",
    		source: "(85:6) <TutorialImage imageFileName={images[3]}>",
    		ctx
    	});

    	return block;
    }

    // (94:6) <TutorialImage imageFileName={images[4]}>
    function create_default_slot_1$1(ctx) {
    	let h2;
    	let t1;
    	let p;
    	let span;
    	let t3;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Using the map function";
    			t1 = space();
    			p = element("p");
    			span = element("span");
    			span.textContent = "You can also view projections as a map.";
    			t3 = text("\r\n          Use the slider below the map to change the year of data. The maps are\r\n          color-coded to indicate the location of each area.");
    			add_location(h2, file$i, 94, 8, 3365);
    			attr_dev(span, "class", "has-text-weight-semibold");
    			add_location(span, file$i, 96, 10, 3421);
    			add_location(p, file$i, 95, 8, 3406);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p, anchor);
    			append_dev(p, span);
    			append_dev(p, t3);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$1.name,
    		type: "slot",
    		source: "(94:6) <TutorialImage imageFileName={images[4]}>",
    		ctx
    	});

    	return block;
    }

    // (104:6) <TutorialImage imageFileName={images[5]}>
    function create_default_slot$1(ctx) {
    	let h2;
    	let t1;
    	let p;
    	let span0;
    	let t3;
    	let span1;
    	let t5;
    	let span2;
    	let t7;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Using the table option";
    			t1 = space();
    			p = element("p");
    			span0 = element("span");
    			span0.textContent = "You can also view projections in a table.";
    			t3 = text("\r\n          The colors represent the change relative to the baseline (the first\r\n          year, in this case, 2008).\r\n          ");
    			span1 = element("span");
    			span1.textContent = "Red";
    			t5 = text("\r\n          indicates a decrease from the baseline.\r\n          ");
    			span2 = element("span");
    			span2.textContent = "Blue";
    			t7 = text("\r\n          indicates an increase from the baseline. The table can be downloaded\r\n          as a CSV file.");
    			add_location(h2, file$i, 104, 8, 3772);
    			attr_dev(span0, "class", "has-text-weight-semibold");
    			add_location(span0, file$i, 106, 10, 3828);
    			set_style(span1, "color", "red");
    			add_location(span1, file$i, 111, 10, 4070);
    			set_style(span2, "color", "blue");
    			add_location(span2, file$i, 113, 10, 4168);
    			add_location(p, file$i, 105, 8, 3813);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p, anchor);
    			append_dev(p, span0);
    			append_dev(p, t3);
    			append_dev(p, span1);
    			append_dev(p, t5);
    			append_dev(p, span2);
    			append_dev(p, t7);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(104:6) <TutorialImage imageFileName={images[5]}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$i(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let header;
    	let p;
    	let t2;
    	let button;
    	let t3;
    	let section;
    	let h1;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let t9;
    	let t10;
    	let current;
    	let dispose;

    	const tutorialimage0 = new TutorialImage({
    			props: {
    				imageFileName: /*images*/ ctx[1][0],
    				$$slots: { default: [create_default_slot_5] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const tutorialimage1 = new TutorialImage({
    			props: {
    				imageFileName: /*images*/ ctx[1][1],
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const tutorialimage2 = new TutorialImage({
    			props: {
    				imageFileName: /*images*/ ctx[1][2],
    				$$slots: { default: [create_default_slot_3$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const tutorialimage3 = new TutorialImage({
    			props: {
    				imageFileName: /*images*/ ctx[1][3],
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const tutorialimage4 = new TutorialImage({
    			props: {
    				imageFileName: /*images*/ ctx[1][4],
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const tutorialimage5 = new TutorialImage({
    			props: {
    				imageFileName: /*images*/ ctx[1][5],
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			header = element("header");
    			p = element("p");
    			p.textContent = "User Guide";
    			t2 = space();
    			button = element("button");
    			t3 = space();
    			section = element("section");
    			h1 = element("h1");
    			h1.textContent = "Viewing Nurse Workforce Projections";
    			t5 = space();
    			create_component(tutorialimage0.$$.fragment);
    			t6 = space();
    			create_component(tutorialimage1.$$.fragment);
    			t7 = space();
    			create_component(tutorialimage2.$$.fragment);
    			t8 = space();
    			create_component(tutorialimage3.$$.fragment);
    			t9 = space();
    			create_component(tutorialimage4.$$.fragment);
    			t10 = space();
    			create_component(tutorialimage5.$$.fragment);
    			attr_dev(div0, "class", "modal-background");
    			add_location(div0, file$i, 22, 2, 467);
    			attr_dev(p, "class", "modal-card-title");
    			add_location(p, file$i, 25, 6, 582);
    			attr_dev(button, "class", "delete");
    			attr_dev(button, "aria-label", "close");
    			attr_dev(button, "data-bulma-modal", "close");
    			add_location(button, file$i, 26, 6, 632);
    			attr_dev(header, "class", "modal-card-head");
    			add_location(header, file$i, 24, 4, 542);
    			attr_dev(h1, "class", "title");
    			add_location(h1, file$i, 33, 6, 816);
    			attr_dev(section, "class", "modal-card-body content");
    			add_location(section, file$i, 32, 4, 767);
    			attr_dev(div1, "class", "modal-card");
    			add_location(div1, file$i, 23, 2, 512);
    			attr_dev(div2, "class", "modal");
    			toggle_class(div2, "is-active", /*showModal*/ ctx[0]);
    			add_location(div2, file$i, 21, 0, 416);

    			dispose = [
    				listen_dev(div0, "click", /*click_handler*/ ctx[3], false, false, false),
    				listen_dev(button, "click", /*click_handler_1*/ ctx[2], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			append_dev(div1, header);
    			append_dev(header, p);
    			append_dev(header, t2);
    			append_dev(header, button);
    			append_dev(div1, t3);
    			append_dev(div1, section);
    			append_dev(section, h1);
    			append_dev(section, t5);
    			mount_component(tutorialimage0, section, null);
    			append_dev(section, t6);
    			mount_component(tutorialimage1, section, null);
    			append_dev(section, t7);
    			mount_component(tutorialimage2, section, null);
    			append_dev(section, t8);
    			mount_component(tutorialimage3, section, null);
    			append_dev(section, t9);
    			mount_component(tutorialimage4, section, null);
    			append_dev(section, t10);
    			mount_component(tutorialimage5, section, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const tutorialimage0_changes = {};

    			if (dirty & /*$$scope*/ 16) {
    				tutorialimage0_changes.$$scope = { dirty, ctx };
    			}

    			tutorialimage0.$set(tutorialimage0_changes);
    			const tutorialimage1_changes = {};

    			if (dirty & /*$$scope*/ 16) {
    				tutorialimage1_changes.$$scope = { dirty, ctx };
    			}

    			tutorialimage1.$set(tutorialimage1_changes);
    			const tutorialimage2_changes = {};

    			if (dirty & /*$$scope*/ 16) {
    				tutorialimage2_changes.$$scope = { dirty, ctx };
    			}

    			tutorialimage2.$set(tutorialimage2_changes);
    			const tutorialimage3_changes = {};

    			if (dirty & /*$$scope*/ 16) {
    				tutorialimage3_changes.$$scope = { dirty, ctx };
    			}

    			tutorialimage3.$set(tutorialimage3_changes);
    			const tutorialimage4_changes = {};

    			if (dirty & /*$$scope*/ 16) {
    				tutorialimage4_changes.$$scope = { dirty, ctx };
    			}

    			tutorialimage4.$set(tutorialimage4_changes);
    			const tutorialimage5_changes = {};

    			if (dirty & /*$$scope*/ 16) {
    				tutorialimage5_changes.$$scope = { dirty, ctx };
    			}

    			tutorialimage5.$set(tutorialimage5_changes);

    			if (dirty & /*showModal*/ 1) {
    				toggle_class(div2, "is-active", /*showModal*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(tutorialimage0.$$.fragment, local);
    			transition_in(tutorialimage1.$$.fragment, local);
    			transition_in(tutorialimage2.$$.fragment, local);
    			transition_in(tutorialimage3.$$.fragment, local);
    			transition_in(tutorialimage4.$$.fragment, local);
    			transition_in(tutorialimage5.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(tutorialimage0.$$.fragment, local);
    			transition_out(tutorialimage1.$$.fragment, local);
    			transition_out(tutorialimage2.$$.fragment, local);
    			transition_out(tutorialimage3.$$.fragment, local);
    			transition_out(tutorialimage4.$$.fragment, local);
    			transition_out(tutorialimage5.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_component(tutorialimage0);
    			destroy_component(tutorialimage1);
    			destroy_component(tutorialimage2);
    			destroy_component(tutorialimage3);
    			destroy_component(tutorialimage4);
    			destroy_component(tutorialimage5);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$i.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$i($$self, $$props, $$invalidate) {
    	let { showModal } = $$props;

    	const images = [
    		"Selectcharttype 500px.png",
    		"Modify chart 500px.png",
    		"Linechart guide 500px.png",
    		"clearviz 500px.png",
    		"MapGuide 500px.png",
    		"Table PNG plain.png"
    	];

    	const writable_props = ["showModal"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TutorialModal> was created with unknown prop '${key}'`);
    	});

    	function click_handler_1(event) {
    		bubble($$self, event);
    	}

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("showModal" in $$props) $$invalidate(0, showModal = $$props.showModal);
    	};

    	$$self.$capture_state = () => {
    		return { showModal };
    	};

    	$$self.$inject_state = $$props => {
    		if ("showModal" in $$props) $$invalidate(0, showModal = $$props.showModal);
    	};

    	return [showModal, images, click_handler_1, click_handler];
    }

    class TutorialModal extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$i, create_fragment$i, safe_not_equal, { showModal: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TutorialModal",
    			options,
    			id: create_fragment$i.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*showModal*/ ctx[0] === undefined && !("showModal" in props)) {
    			console.warn("<TutorialModal> was created without expected prop 'showModal'");
    		}
    	}

    	get showModal() {
    		throw new Error("<TutorialModal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showModal(value) {
    		throw new Error("<TutorialModal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\CardButton.svelte generated by Svelte v3.16.0 */
    const file$j = "src\\CardButton.svelte";
    const get_subtitle_slot_changes = dirty => ({});
    const get_subtitle_slot_context = ctx => ({});

    function create_fragment$j(ctx) {
    	let div2;
    	let div0;
    	let p0;
    	let t0;
    	let t1;
    	let p1;
    	let t2;
    	let t3;
    	let div1;
    	let current;
    	let dispose;
    	const subtitle_slot_template = /*$$slots*/ ctx[7].subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_template, ctx, /*$$scope*/ ctx[6], get_subtitle_slot_context);

    	const infobox = new InfoBox({
    			props: {
    				title: /*title*/ ctx[1],
    				info: /*info*/ ctx[2],
    				invert: /*active*/ ctx[3]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			p0 = element("p");
    			t0 = text(/*title*/ ctx[1]);
    			t1 = space();
    			p1 = element("p");

    			if (!subtitle_slot) {
    				t2 = text("Subtitle");
    			}

    			if (subtitle_slot) subtitle_slot.c();
    			t3 = space();
    			div1 = element("div");
    			create_component(infobox.$$.fragment);
    			attr_dev(p0, "class", "is-size-3");
    			add_location(p0, file$j, 21, 4, 493);
    			attr_dev(p1, "class", "is-size-4");
    			add_location(p1, file$j, 22, 4, 531);
    			attr_dev(div0, "class", "card-content");
    			add_location(div0, file$j, 20, 2, 461);
    			attr_dev(div1, "class", "is-pulled-right");
    			add_location(div1, file$j, 26, 2, 621);
    			attr_dev(div2, "class", "card column is-one-quarter svelte-b3dali");
    			toggle_class(div2, "has-background-primary", /*active*/ ctx[3]);
    			toggle_class(div2, "has-text-white", /*active*/ ctx[3]);
    			add_location(div2, file$j, 14, 0, 292);
    			dispose = listen_dev(div2, "click", /*click_handler*/ ctx[8], false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div0, p0);
    			append_dev(p0, t0);
    			append_dev(div0, t1);
    			append_dev(div0, p1);

    			if (!subtitle_slot) {
    				append_dev(p1, t2);
    			}

    			if (subtitle_slot) {
    				subtitle_slot.m(p1, null);
    			}

    			append_dev(div2, t3);
    			append_dev(div2, div1);
    			mount_component(infobox, div1, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*title*/ 2) set_data_dev(t0, /*title*/ ctx[1]);

    			if (subtitle_slot && subtitle_slot.p && dirty & /*$$scope*/ 64) {
    				subtitle_slot.p(get_slot_context(subtitle_slot_template, ctx, /*$$scope*/ ctx[6], get_subtitle_slot_context), get_slot_changes(subtitle_slot_template, /*$$scope*/ ctx[6], dirty, get_subtitle_slot_changes));
    			}

    			const infobox_changes = {};
    			if (dirty & /*title*/ 2) infobox_changes.title = /*title*/ ctx[1];
    			if (dirty & /*info*/ 4) infobox_changes.info = /*info*/ ctx[2];
    			if (dirty & /*active*/ 8) infobox_changes.invert = /*active*/ ctx[3];
    			infobox.$set(infobox_changes);

    			if (dirty & /*active*/ 8) {
    				toggle_class(div2, "has-background-primary", /*active*/ ctx[3]);
    			}

    			if (dirty & /*active*/ 8) {
    				toggle_class(div2, "has-text-white", /*active*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			transition_in(infobox.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(subtitle_slot, local);
    			transition_out(infobox.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (subtitle_slot) subtitle_slot.d(detaching);
    			destroy_component(infobox);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$j.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$j($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { calculation } = $$props;
    	let { name } = $$props;
    	let { title } = $$props;
    	let { info } = $$props;
    	const writable_props = ["calculation", "name", "title", "info"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<CardButton> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	const click_handler = () => dispatch("clicked", name);

    	$$self.$set = $$props => {
    		if ("calculation" in $$props) $$invalidate(5, calculation = $$props.calculation);
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("info" in $$props) $$invalidate(2, info = $$props.info);
    		if ("$$scope" in $$props) $$invalidate(6, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => {
    		return { calculation, name, title, info, active };
    	};

    	$$self.$inject_state = $$props => {
    		if ("calculation" in $$props) $$invalidate(5, calculation = $$props.calculation);
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("info" in $$props) $$invalidate(2, info = $$props.info);
    		if ("active" in $$props) $$invalidate(3, active = $$props.active);
    	};

    	let active;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*calculation, name*/ 33) {
    			 $$invalidate(3, active = calculation == name);
    		}
    	};

    	return [
    		name,
    		title,
    		info,
    		active,
    		dispatch,
    		calculation,
    		$$scope,
    		$$slots,
    		click_handler
    	];
    }

    class CardButton extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$j, create_fragment$j, safe_not_equal, {
    			calculation: 5,
    			name: 0,
    			title: 1,
    			info: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CardButton",
    			options,
    			id: create_fragment$j.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*calculation*/ ctx[5] === undefined && !("calculation" in props)) {
    			console.warn("<CardButton> was created without expected prop 'calculation'");
    		}

    		if (/*name*/ ctx[0] === undefined && !("name" in props)) {
    			console.warn("<CardButton> was created without expected prop 'name'");
    		}

    		if (/*title*/ ctx[1] === undefined && !("title" in props)) {
    			console.warn("<CardButton> was created without expected prop 'title'");
    		}

    		if (/*info*/ ctx[2] === undefined && !("info" in props)) {
    			console.warn("<CardButton> was created without expected prop 'info'");
    		}
    	}

    	get calculation() {
    		throw new Error("<CardButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set calculation(value) {
    		throw new Error("<CardButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get name() {
    		throw new Error("<CardButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<CardButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<CardButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<CardButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get info() {
    		throw new Error("<CardButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set info(value) {
    		throw new Error("<CardButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.16.0 */
    const file$k = "src\\App.svelte";

    // (114:8) <span slot="subtitle">
    function create_subtitle_slot_3(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "Will there be a shortage or surplus?";
    			attr_dev(span, "slot", "subtitle");
    			add_location(span, file$k, 113, 8, 3302);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_subtitle_slot_3.name,
    		type: "slot",
    		source: "(114:8) <span slot=\\\"subtitle\\\">",
    		ctx
    	});

    	return block;
    }

    // (107:6) <CardButton          name="difference"          title="Supply - Demand"          info={formInfo.get("difference")}          {calculation}          on:clicked={handleCalculationClick}        >
    function create_default_slot_3$2(ctx) {
    	const block = { c: noop, m: noop, p: noop, d: noop };

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3$2.name,
    		type: "slot",
    		source: "(107:6) <CardButton          name=\\\"difference\\\"          title=\\\"Supply - Demand\\\"          info={formInfo.get(\\\"difference\\\")}          {calculation}          on:clicked={handleCalculationClick}        >",
    		ctx
    	});

    	return block;
    }

    // (123:8) <span slot="subtitle">
    function create_subtitle_slot_2(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "What is the relative shortage or surplus?";
    			attr_dev(span, "slot", "subtitle");
    			add_location(span, file$k, 122, 8, 3597);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_subtitle_slot_2.name,
    		type: "slot",
    		source: "(123:8) <span slot=\\\"subtitle\\\">",
    		ctx
    	});

    	return block;
    }

    // (116:6) <CardButton          name="percentage"          title="Supply / Demand"          info={formInfo.get("percentage")}          {calculation}          on:clicked={handleCalculationClick}        >
    function create_default_slot_2$2(ctx) {
    	const block = { c: noop, m: noop, p: noop, d: noop };

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$2.name,
    		type: "slot",
    		source: "(116:6) <CardButton          name=\\\"percentage\\\"          title=\\\"Supply / Demand\\\"          info={formInfo.get(\\\"percentage\\\")}          {calculation}          on:clicked={handleCalculationClick}        >",
    		ctx
    	});

    	return block;
    }

    // (133:8) <span slot="subtitle">
    function create_subtitle_slot_1(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "How many nurses are projected in the future?";
    			attr_dev(span, "slot", "subtitle");
    			add_location(span, file$k, 132, 8, 3882);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_subtitle_slot_1.name,
    		type: "slot",
    		source: "(133:8) <span slot=\\\"subtitle\\\">",
    		ctx
    	});

    	return block;
    }

    // (126:6) <CardButton          name="supply"          title="Supply"          info={formInfo.get("supply")}          {calculation}          on:clicked={handleCalculationClick}        >
    function create_default_slot_1$2(ctx) {
    	const block = { c: noop, m: noop, p: noop, d: noop };

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$2.name,
    		type: "slot",
    		source: "(126:6) <CardButton          name=\\\"supply\\\"          title=\\\"Supply\\\"          info={formInfo.get(\\\"supply\\\")}          {calculation}          on:clicked={handleCalculationClick}        >",
    		ctx
    	});

    	return block;
    }

    // (144:8) <span slot="subtitle">
    function create_subtitle_slot(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "What will be the demand for services?";
    			attr_dev(span, "slot", "subtitle");
    			add_location(span, file$k, 143, 8, 4190);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_subtitle_slot.name,
    		type: "slot",
    		source: "(144:8) <span slot=\\\"subtitle\\\">",
    		ctx
    	});

    	return block;
    }

    // (137:6) <CardButton          name="demand"          title="Demand"          info={formInfo.get("demand")}          {calculation}          on:clicked={handleCalculationClick}        >
    function create_default_slot$2(ctx) {
    	const block = { c: noop, m: noop, p: noop, d: noop };

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$2.name,
    		type: "slot",
    		source: "(137:6) <CardButton          name=\\\"demand\\\"          title=\\\"Demand\\\"          info={formInfo.get(\\\"demand\\\")}          {calculation}          on:clicked={handleCalculationClick}        >",
    		ctx
    	});

    	return block;
    }

    // (209:8) {:else}
    function create_else_block_2(ctx) {
    	let current;

    	const introblock = new IntroBlock({
    			props: { chartType: /*chartType*/ ctx[2] },
    			$$inline: true
    		});

    	introblock.$on("launchTutorial", /*handleLaunchTutorial*/ ctx[12]);

    	const block = {
    		c: function create() {
    			create_component(introblock.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(introblock, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const introblock_changes = {};
    			if (dirty & /*chartType*/ 4) introblock_changes.chartType = /*chartType*/ ctx[2];
    			introblock.$set(introblock_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(introblock.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(introblock.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(introblock, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2.name,
    		type: "else",
    		source: "(209:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (171:8) {#if data.get(calculation).get(chartType).length > 0}
    function create_if_block$8(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let t2;
    	let current_block_type_index;
    	let if_block1;
    	let if_block1_anchor;
    	let current;
    	let if_block0 = (/*chartType*/ ctx[2] == "line" || /*chartType*/ ctx[2] == "map") && create_if_block_4$1(ctx);

    	const downloaddata = new DownloadData({
    			props: {
    				data: /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2]),
    				chartType: /*chartType*/ ctx[2],
    				projectionStartYear: /*projectionStartYear*/ ctx[6]
    			},
    			$$inline: true
    		});

    	const if_block_creators = [create_if_block_1$6, create_if_block_3$2, create_else_block_1$2];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*chartType*/ ctx[2] == "line") return 0;
    		if (/*chartType*/ ctx[2] == "map") return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			create_component(downloaddata.$$.fragment);
    			t2 = space();
    			if_block1.c();
    			if_block1_anchor = empty();
    			attr_dev(div0, "class", "column is-hidden-mobile is-paddingless");
    			add_location(div0, file$k, 172, 12, 5206);
    			attr_dev(div1, "class", "column is-narrow is-paddingless");
    			add_location(div1, file$k, 173, 12, 5274);
    			attr_dev(div2, "class", "columns is-marginless");
    			add_location(div2, file$k, 171, 10, 5157);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			if (if_block0) if_block0.m(div1, null);
    			append_dev(div1, t1);
    			mount_component(downloaddata, div1, null);
    			insert_dev(target, t2, anchor);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*chartType*/ ctx[2] == "line" || /*chartType*/ ctx[2] == "map") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_4$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			const downloaddata_changes = {};
    			if (dirty & /*data, calculation, chartType*/ 21) downloaddata_changes.data = /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2]);
    			if (dirty & /*chartType*/ 4) downloaddata_changes.chartType = /*chartType*/ ctx[2];
    			downloaddata.$set(downloaddata_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block1 = if_blocks[current_block_type_index];

    				if (!if_block1) {
    					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block1.c();
    				}

    				transition_in(if_block1, 1);
    				if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(downloaddata.$$.fragment, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(downloaddata.$$.fragment, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (if_block0) if_block0.d();
    			destroy_component(downloaddata);
    			if (detaching) detach_dev(t2);
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$8.name,
    		type: "if",
    		source: "(171:8) {#if data.get(calculation).get(chartType).length > 0}",
    		ctx
    	});

    	return block;
    }

    // (175:14) {#if chartType == "line" || chartType == "map"}
    function create_if_block_4$1(ctx) {
    	let current;

    	const downloadimage = new DownloadImage({
    			props: { chartType: /*chartType*/ ctx[2] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(downloadimage.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(downloadimage, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const downloadimage_changes = {};
    			if (dirty & /*chartType*/ 4) downloadimage_changes.chartType = /*chartType*/ ctx[2];
    			downloadimage.$set(downloadimage_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(downloadimage.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(downloadimage.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(downloadimage, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4$1.name,
    		type: "if",
    		source: "(175:14) {#if chartType == \\\"line\\\" || chartType == \\\"map\\\"}",
    		ctx
    	});

    	return block;
    }

    // (206:10) {:else}
    function create_else_block_1$2(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "An error has occurred.";
    			attr_dev(div, "class", "notification");
    			add_location(div, file$k, 206, 12, 6479);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1$2.name,
    		type: "else",
    		source: "(206:10) {:else}",
    		ctx
    	});

    	return block;
    }

    // (200:39) 
    function create_if_block_3$2(ctx) {
    	let current;

    	const simplemap = new SimpleMap({
    			props: {
    				data: /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2])[0],
    				geoJSON: /*geoJSON*/ ctx[1],
    				projectionStartYear: /*projectionStartYear*/ ctx[6]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(simplemap.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(simplemap, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const simplemap_changes = {};
    			if (dirty & /*data, calculation, chartType*/ 21) simplemap_changes.data = /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2])[0];
    			if (dirty & /*geoJSON*/ 2) simplemap_changes.geoJSON = /*geoJSON*/ ctx[1];
    			simplemap.$set(simplemap_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(simplemap.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(simplemap.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(simplemap, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$2.name,
    		type: "if",
    		source: "(200:39) ",
    		ctx
    	});

    	return block;
    }

    // (185:10) {#if chartType == "line"}
    function create_if_block_1$6(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_2$6, create_else_block$6];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*calculation*/ ctx[4] == "difference") return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$6.name,
    		type: "if",
    		source: "(185:10) {#if chartType == \\\"line\\\"}",
    		ctx
    	});

    	return block;
    }

    // (192:12) {:else}
    function create_else_block$6(ctx) {
    	let current;

    	const linechart = new LineChart({
    			props: {
    				data: /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2]),
    				projectionStartYear: /*projectionStartYear*/ ctx[6],
    				calculation: /*calculation*/ ctx[4]
    			},
    			$$inline: true
    		});

    	linechart.$on("deleteProjection", /*handleDeleteProjection*/ ctx[8]);

    	const block = {
    		c: function create() {
    			create_component(linechart.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(linechart, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const linechart_changes = {};
    			if (dirty & /*data, calculation, chartType*/ 21) linechart_changes.data = /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2]);
    			if (dirty & /*calculation*/ 16) linechart_changes.calculation = /*calculation*/ ctx[4];
    			linechart.$set(linechart_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(linechart.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(linechart.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(linechart, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$6.name,
    		type: "else",
    		source: "(192:12) {:else}",
    		ctx
    	});

    	return block;
    }

    // (186:12) {#if calculation == "difference"}
    function create_if_block_2$6(ctx) {
    	let current;

    	const linechartdifference = new LineChartDifference({
    			props: {
    				data: /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2]),
    				projectionStartYear: /*projectionStartYear*/ ctx[6]
    			},
    			$$inline: true
    		});

    	linechartdifference.$on("deleteProjection", /*handleDeleteProjection*/ ctx[8]);

    	const block = {
    		c: function create() {
    			create_component(linechartdifference.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(linechartdifference, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const linechartdifference_changes = {};
    			if (dirty & /*data, calculation, chartType*/ 21) linechartdifference_changes.data = /*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2]);
    			linechartdifference.$set(linechartdifference_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(linechartdifference.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(linechartdifference.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(linechartdifference, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$6.name,
    		type: "if",
    		source: "(186:12) {#if calculation == \\\"difference\\\"}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$k(ctx) {
    	let section;
    	let t0;
    	let div5;
    	let div0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let div4;
    	let div1;
    	let t5;
    	let div3;
    	let div2;
    	let ul;
    	let li0;
    	let a0;
    	let li0_class_value;
    	let t7;
    	let li1;
    	let a1;
    	let li1_class_value;
    	let t9;
    	let show_if;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	let dispose;

    	const tutorialmodal = new TutorialModal({
    			props: { showModal: /*showModal*/ ctx[3] },
    			$$inline: true
    		});

    	tutorialmodal.$on("click", /*click_handler*/ ctx[14]);

    	const cardbutton0 = new CardButton({
    			props: {
    				name: "difference",
    				title: "Supply - Demand",
    				info: formInfo.get("difference"),
    				calculation: /*calculation*/ ctx[4],
    				$$slots: {
    					default: [create_default_slot_3$2],
    					subtitle: [create_subtitle_slot_3]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	cardbutton0.$on("clicked", /*handleCalculationClick*/ ctx[11]);

    	const cardbutton1 = new CardButton({
    			props: {
    				name: "percentage",
    				title: "Supply / Demand",
    				info: formInfo.get("percentage"),
    				calculation: /*calculation*/ ctx[4],
    				$$slots: {
    					default: [create_default_slot_2$2],
    					subtitle: [create_subtitle_slot_2]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	cardbutton1.$on("clicked", /*handleCalculationClick*/ ctx[11]);

    	const cardbutton2 = new CardButton({
    			props: {
    				name: "supply",
    				title: "Supply",
    				info: formInfo.get("supply"),
    				calculation: /*calculation*/ ctx[4],
    				$$slots: {
    					default: [create_default_slot_1$2],
    					subtitle: [create_subtitle_slot_1]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	cardbutton2.$on("clicked", /*handleCalculationClick*/ ctx[11]);

    	const cardbutton3 = new CardButton({
    			props: {
    				name: "demand",
    				title: "Demand",
    				info: formInfo.get("demand"),
    				calculation: /*calculation*/ ctx[4],
    				$$slots: {
    					default: [create_default_slot$2],
    					subtitle: [create_subtitle_slot]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	cardbutton3.$on("clicked", /*handleCalculationClick*/ ctx[11]);

    	const modelform = new ModelForm({
    			props: {
    				isLoading: /*isLoading*/ ctx[5],
    				calculation: /*calculation*/ ctx[4],
    				chartType: /*chartType*/ ctx[2]
    			},
    			$$inline: true
    		});

    	modelform.$on("showProjection", /*handleShowProjection*/ ctx[7]);
    	modelform.$on("clearProjections", /*handleClearData*/ ctx[9]);
    	modelform.$on("launchTutorial", /*handleLaunchTutorial*/ ctx[12]);
    	const if_block_creators = [create_if_block$8, create_else_block_2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (dirty & /*data, calculation, chartType*/ 21) show_if = !!(/*data*/ ctx[0].get(/*calculation*/ ctx[4]).get(/*chartType*/ ctx[2]).length > 0);
    		if (show_if) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx, -1);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			section = element("section");
    			create_component(tutorialmodal.$$.fragment);
    			t0 = space();
    			div5 = element("div");
    			div0 = element("div");
    			create_component(cardbutton0.$$.fragment);
    			t1 = space();
    			create_component(cardbutton1.$$.fragment);
    			t2 = space();
    			create_component(cardbutton2.$$.fragment);
    			t3 = space();
    			create_component(cardbutton3.$$.fragment);
    			t4 = space();
    			div4 = element("div");
    			div1 = element("div");
    			create_component(modelform.$$.fragment);
    			t5 = space();
    			div3 = element("div");
    			div2 = element("div");
    			ul = element("ul");
    			li0 = element("li");
    			a0 = element("a");
    			a0.textContent = "Line Chart";
    			t7 = space();
    			li1 = element("li");
    			a1 = element("a");
    			a1.textContent = "Map";
    			t9 = space();
    			if_block.c();
    			attr_dev(div0, "class", "columns");
    			set_style(div0, "margin-bottom", "2rem");
    			add_location(div0, file$k, 105, 4, 3043);
    			attr_dev(div1, "class", "column is-4");
    			add_location(div1, file$k, 148, 6, 4326);
    			attr_dev(a0, "id", "line");
    			add_location(a0, file$k, 163, 14, 4841);
    			attr_dev(li0, "class", li0_class_value = /*chartType*/ ctx[2] == "line" ? "is-active" : "");
    			add_location(li0, file$k, 162, 12, 4774);
    			attr_dev(a1, "id", "map");
    			add_location(a1, file$k, 166, 14, 4989);
    			attr_dev(li1, "class", li1_class_value = /*chartType*/ ctx[2] == "map" ? "is-active" : "");
    			add_location(li1, file$k, 165, 12, 4923);
    			add_location(ul, file$k, 161, 10, 4756);
    			attr_dev(div2, "class", "tabs ");
    			add_location(div2, file$k, 159, 8, 4668);
    			attr_dev(div3, "class", "column is-8 box");
    			add_location(div3, file$k, 158, 6, 4629);
    			attr_dev(div4, "class", "columns");
    			add_location(div4, file$k, 147, 4, 4297);
    			attr_dev(div5, "class", "container");
    			attr_dev(div5, "id", "main-container");
    			add_location(div5, file$k, 104, 2, 2994);
    			attr_dev(section, "class", "section");
    			toggle_class(section, "is-clipped", /*showModal*/ ctx[3]);
    			add_location(section, file$k, 102, 0, 2866);

    			dispose = [
    				listen_dev(a0, "click", /*tabClicked*/ ctx[10], false, false, false),
    				listen_dev(a1, "click", /*tabClicked*/ ctx[10], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			mount_component(tutorialmodal, section, null);
    			append_dev(section, t0);
    			append_dev(section, div5);
    			append_dev(div5, div0);
    			mount_component(cardbutton0, div0, null);
    			append_dev(div0, t1);
    			mount_component(cardbutton1, div0, null);
    			append_dev(div0, t2);
    			mount_component(cardbutton2, div0, null);
    			append_dev(div0, t3);
    			mount_component(cardbutton3, div0, null);
    			append_dev(div5, t4);
    			append_dev(div5, div4);
    			append_dev(div4, div1);
    			mount_component(modelform, div1, null);
    			append_dev(div4, t5);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div2, ul);
    			append_dev(ul, li0);
    			append_dev(li0, a0);
    			append_dev(ul, t7);
    			append_dev(ul, li1);
    			append_dev(li1, a1);
    			append_dev(div3, t9);
    			if_blocks[current_block_type_index].m(div3, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const tutorialmodal_changes = {};
    			if (dirty & /*showModal*/ 8) tutorialmodal_changes.showModal = /*showModal*/ ctx[3];
    			tutorialmodal.$set(tutorialmodal_changes);
    			const cardbutton0_changes = {};
    			if (dirty & /*calculation*/ 16) cardbutton0_changes.calculation = /*calculation*/ ctx[4];

    			if (dirty & /*$$scope*/ 32768) {
    				cardbutton0_changes.$$scope = { dirty, ctx };
    			}

    			cardbutton0.$set(cardbutton0_changes);
    			const cardbutton1_changes = {};
    			if (dirty & /*calculation*/ 16) cardbutton1_changes.calculation = /*calculation*/ ctx[4];

    			if (dirty & /*$$scope*/ 32768) {
    				cardbutton1_changes.$$scope = { dirty, ctx };
    			}

    			cardbutton1.$set(cardbutton1_changes);
    			const cardbutton2_changes = {};
    			if (dirty & /*calculation*/ 16) cardbutton2_changes.calculation = /*calculation*/ ctx[4];

    			if (dirty & /*$$scope*/ 32768) {
    				cardbutton2_changes.$$scope = { dirty, ctx };
    			}

    			cardbutton2.$set(cardbutton2_changes);
    			const cardbutton3_changes = {};
    			if (dirty & /*calculation*/ 16) cardbutton3_changes.calculation = /*calculation*/ ctx[4];

    			if (dirty & /*$$scope*/ 32768) {
    				cardbutton3_changes.$$scope = { dirty, ctx };
    			}

    			cardbutton3.$set(cardbutton3_changes);
    			const modelform_changes = {};
    			if (dirty & /*isLoading*/ 32) modelform_changes.isLoading = /*isLoading*/ ctx[5];
    			if (dirty & /*calculation*/ 16) modelform_changes.calculation = /*calculation*/ ctx[4];
    			if (dirty & /*chartType*/ 4) modelform_changes.chartType = /*chartType*/ ctx[2];
    			modelform.$set(modelform_changes);

    			if (!current || dirty & /*chartType*/ 4 && li0_class_value !== (li0_class_value = /*chartType*/ ctx[2] == "line" ? "is-active" : "")) {
    				attr_dev(li0, "class", li0_class_value);
    			}

    			if (!current || dirty & /*chartType*/ 4 && li1_class_value !== (li1_class_value = /*chartType*/ ctx[2] == "map" ? "is-active" : "")) {
    				attr_dev(li1, "class", li1_class_value);
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx, dirty);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div3, null);
    			}

    			if (dirty & /*showModal*/ 8) {
    				toggle_class(section, "is-clipped", /*showModal*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(tutorialmodal.$$.fragment, local);
    			transition_in(cardbutton0.$$.fragment, local);
    			transition_in(cardbutton1.$$.fragment, local);
    			transition_in(cardbutton2.$$.fragment, local);
    			transition_in(cardbutton3.$$.fragment, local);
    			transition_in(modelform.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(tutorialmodal.$$.fragment, local);
    			transition_out(cardbutton0.$$.fragment, local);
    			transition_out(cardbutton1.$$.fragment, local);
    			transition_out(cardbutton2.$$.fragment, local);
    			transition_out(cardbutton3.$$.fragment, local);
    			transition_out(modelform.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_component(tutorialmodal);
    			destroy_component(cardbutton0);
    			destroy_component(cardbutton1);
    			destroy_component(cardbutton2);
    			destroy_component(cardbutton3);
    			destroy_component(modelform);
    			if_blocks[current_block_type_index].d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$k.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let data = new Map(["supply", "demand", "percentage", "difference"].map(d => [d, new Map(["line", "map"].map(e => [e, []]))]));
    	let geoJSON;
    	let chartType = "line";
    	let showModal = false;
    	let projectionStartYear = 2019;
    	let calculation = "difference";
    	let isLoading = false;

    	onMount(() => {
    		const tutorialHistory = localStorage.getItem("nurse-model-tutorial");

    		if (tutorialHistory != "seen") {
    			$$invalidate(3, showModal = true);
    			localStorage.setItem("nurse-model-tutorial", "seen");
    		}

    		dataFetch(`/model/public/maps/ncLayers.json`).then(json => {
    			$$invalidate(1, geoJSON = json);
    		});
    	});

    	async function getData(type, calc, allParams) {
    		dataFetch(makeQueryURL(allParams)).then(function (newData) {
    			if (type == "line") {
    				const currentData = data.get(calc).get(type);
    				data.get(calc).set(type, [...currentData, ...newData]);
    			} else {
    				data.get(calc).set(type, newData);
    			}

    			$$invalidate(0, data);
    		}).then(() => {
    			$$invalidate(5, isLoading = false);
    		});
    	}

    	function handleShowProjection({ detail }) {
    		$$invalidate(5, isLoading = true);
    		getData(chartType, calculation, [{ name: "calculation", value: calculation }, ...detail]);
    	}

    	function handleDeleteProjection(e) {
    		const currentProjections = data.get(calculation).get(chartType);
    		data.get(calculation).set(chartType, currentProjections.filter(d => d.id != +e.detail));
    		$$invalidate(0, data);
    	}

    	function handleClearData() {
    		data.get(calculation).set(chartType, []);
    		$$invalidate(0, data);
    	}

    	function tabClicked(e) {
    		if (chartType != e.target.id) {
    			$$invalidate(2, chartType = e.target.id);
    		}
    	}

    	function handleCalculationClick({ detail }) {
    		$$invalidate(4, calculation = detail);
    	}

    	function handleLaunchTutorial() {
    		$$invalidate(3, showModal = true);
    	}

    	const click_handler = () => $$invalidate(3, showModal = false);

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("geoJSON" in $$props) $$invalidate(1, geoJSON = $$props.geoJSON);
    		if ("chartType" in $$props) $$invalidate(2, chartType = $$props.chartType);
    		if ("showModal" in $$props) $$invalidate(3, showModal = $$props.showModal);
    		if ("projectionStartYear" in $$props) $$invalidate(6, projectionStartYear = $$props.projectionStartYear);
    		if ("calculation" in $$props) $$invalidate(4, calculation = $$props.calculation);
    		if ("isLoading" in $$props) $$invalidate(5, isLoading = $$props.isLoading);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*data*/ 1) {
    			 console.log(data);
    		}
    	};

    	return [
    		data,
    		geoJSON,
    		chartType,
    		showModal,
    		calculation,
    		isLoading,
    		projectionStartYear,
    		handleShowProjection,
    		handleDeleteProjection,
    		handleClearData,
    		tabClicked,
    		handleCalculationClick,
    		handleLaunchTutorial,
    		getData,
    		click_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$k, create_fragment$k, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$k.name
    		});
    	}
    }

    const app = new App({
    	target: document.getElementById("app"),
    	props: {

    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
