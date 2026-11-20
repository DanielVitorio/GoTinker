import { api, query } from './api.js';
import { LANGUAGE_ID } from './php.js';
import { bus, shortClass } from './util.js';
import { t } from './i18n.js';

const EB = 'Illuminate\\Database\\Eloquent\\Builder';
const QB = 'Illuminate\\Database\\Query\\Builder';
const EC = 'Illuminate\\Database\\Eloquent\\Collection';
const SC = 'Illuminate\\Support\\Collection';
const PAGINATOR = 'Illuminate\\Pagination\\LengthAwarePaginator';

const projects = new Map();
let contextProvider = () => ({ project: '', variables: [], env: {} });

const modelResult = new Set(['find', 'findorfail', 'findornew', 'first', 'firstorfail', 'firstornew', 'firstorcreate', 'firstwhere', 'sole', 'create', 'forcecreate', 'make', 'updateorcreate', 'createorfirst', 'findsole']);
const collectionResult = new Set(['get', 'all', 'findmany', 'hydrate', 'fromquery']);
const paginatorResult = new Set(['paginate', 'simplepaginate', 'cursorpaginate']);
const scalarResult = new Set(['count', 'exists', 'doesntexist', 'sum', 'avg', 'average', 'min', 'max', 'value', 'update', 'delete', 'insert', 'increment', 'decrement', 'upsert', 'forcedelete', 'tosql', 'toarray', 'tojson', 'implode', 'pluck']);
const commonBuilder = ['where', 'with', 'first', 'get', 'find', 'orderBy', 'latest', 'whereIn', 'paginate', 'count', 'pluck', 'select', 'limit', 'whereHas', 'create', 'firstOrCreate', 'updateOrCreate', 'exists', 'orWhere', 'query', 'all', 'findOrFail', 'firstOrFail', 'take', 'whereNull', 'whereNotNull', 'withCount', 'has', 'oldest', 'toSql', 'value', 'chunk', 'each', 'delete', 'update'];
const elementResult = new Set(['first', 'last', 'firstwhere', 'firstorfail', 'sole', 'pop', 'shift', 'find', 'get', 'random', 'pull', 'reduce', 'max', 'min']);
const sameCollection = new Set(['filter', 'where', 'wherein', 'wherenotin', 'wherenull', 'wherenotnull', 'wherebetween', 'sortby', 'sortbydesc', 'sort', 'sortdesc', 'unique', 'values', 'reverse', 'take', 'skip', 'slice', 'each', 'merge', 'keyby', 'reject', 'shuffle', 'concat', 'push', 'prepend', 'put', 'forget', 'except', 'only', 'diff', 'intersect', 'fresh', 'load', 'loadmissing', 'loadcount', 'makehidden', 'makevisible', 'append', 'unless', 'when', 'tap', 'transform', 'chunk']);
const stringColumnMethods = /(?:->|::)\s*(where|orWhere|whereIn|whereNotIn|whereNull|whereNotNull|whereBetween|whereNotBetween|whereDate|whereMonth|whereYear|whereDay|whereTime|whereColumn|whereLike|orderBy|orderByDesc|latest|oldest|pluck|value|select|addSelect|groupBy|firstWhere|increment|decrement|sum|avg|min|max|sortBy|sortByDesc|keyBy|groupBy|only|except|makeHidden|makeVisible|getAttribute|isDirty|wasChanged|getOriginal)\s*\(\s*(?:\[\s*(?:(['"])[^'"]*\2\s*,\s*)*)?(['"])([A-Za-z0-9_.]*)$/;
const stringRelationMethods = /(?:->|::)\s*(with|load|loadMissing|loadCount|withCount|has|whereHas|orWhereHas|doesntHave|whereDoesntHave|withWhereHas|whereRelation|orWhereRelation|withExists|withSum|withAvg|withMax|withMin|loadSum|relationLoaded|getRelation|setRelation|unsetRelation)\s*\(\s*(?:\[\s*(?:(['"])[^'"]*\2\s*,\s*)*)?(['"])([A-Za-z0-9_.]*)$/;

const helperFunctions = [
    ['collect', '$value = []', SC, 'Create a collection from the given value.'],
    ['now', '$tz = null', 'Illuminate\\Support\\Carbon', 'Create a new Carbon instance for the current time.'],
    ['today', '$tz = null', 'Illuminate\\Support\\Carbon', 'Create a new Carbon instance for the current date.'],
    ['config', '$key = null, $default = null', 'mixed', 'Get / set the specified configuration value.'],
    ['env', '$key, $default = null', 'mixed', 'Gets the value of an environment variable.'],
    ['app', '$abstract = null, array $parameters = []', 'Illuminate\\Foundation\\Application', 'Get the available container instance.'],
    ['resolve', '$name, array $parameters = []', 'mixed', 'Resolve a service from the container.'],
    ['dd', '...$vars', 'never', 'Dump the passed variables and end the script.'],
    ['dump', '...$vars', 'mixed', 'Dump the passed variables.'],
    ['info', '$message, $context = []', 'void', 'Write some information to the log.'],
    ['logger', '$message = null, array $context = []', 'Illuminate\\Log\\LogManager', 'Log a debug message to the logs.'],
    ['cache', '$key = null, $default = null', 'Illuminate\\Cache\\CacheManager', 'Get / set the specified cache value.'],
    ['session', '$key = null, $default = null', 'Illuminate\\Session\\SessionManager', 'Get / set the specified session value.'],
    ['request', '$key = null, $default = null', 'Illuminate\\Http\\Request', 'Get an instance of the current request.'],
    ['response', '$content = null, $status = 200, array $headers = []', 'Illuminate\\Routing\\ResponseFactory', 'Return a new response from the application.'],
    ['route', '$name, $parameters = [], $absolute = true', 'string', 'Generate the URL to a named route.'],
    ['url', '$path = null, $parameters = [], $secure = null', 'Illuminate\\Routing\\UrlGenerator', 'Generate a url for the application.'],
    ['auth', '$guard = null', 'Illuminate\\Auth\\AuthManager', 'Get the available auth instance.'],
    ['bcrypt', '$value, $options = []', 'string', 'Hash the given value against the bcrypt algorithm.'],
    ['str', '$string = null', 'Illuminate\\Support\\Stringable', 'Get a new stringable object from the given string.'],
    ['data_get', '$target, $key, $default = null', 'mixed', 'Get an item from an array or object using "dot" notation.'],
    ['data_set', '&$target, $key, $value, $overwrite = true', 'mixed', 'Set an item on an array or object using dot notation.'],
    ['optional', '$value = null, ?callable $callback = null', 'mixed', 'Provide access to optional objects.'],
    ['rescue', 'callable $callback, $rescue = null, $report = true', 'mixed', 'Catch a potential exception and return a default value.'],
    ['retry', '$times, callable $callback, $sleepMilliseconds = 0, $when = null', 'mixed', 'Retry an operation a given number of times.'],
    ['tap', '$value, $callback = null', 'mixed', 'Call the given Closure with the given value then return the value.'],
    ['value', '$value, ...$args', 'mixed', 'Return the default value of the given value.'],
    ['view', '$view = null, $data = [], $mergeData = []', 'Illuminate\\Contracts\\View\\View', 'Get the evaluated view contents for the given view.'],
    ['abort', '$code, $message = \'\', array $headers = []', 'never', 'Throw an HttpException with the given data.'],
    ['report', '$exception', 'void', 'Report an exception.'],
    ['event', '...$args', 'array|null', 'Dispatch an event and call the listeners.'],
    ['dispatch', '$job', 'Illuminate\\Foundation\\Bus\\PendingDispatch', 'Dispatch a job to its appropriate handler.'],
    ['dispatch_sync', '$job, $handler = null', 'mixed', 'Dispatch a command to its appropriate handler in the current process.'],
    ['fake', '$locale = null', 'Faker\\Generator', 'Get a faker instance.'],
    ['encrypt', '$value, $serialize = true', 'string', 'Encrypt the given value.'],
    ['decrypt', '$value, $unserialize = true', 'mixed', 'Decrypt the given value.'],
    ['base_path', '$path = \'\'', 'string', 'Get the path to the base of the install.'],
    ['app_path', '$path = \'\'', 'string', 'Get the path to the application folder.'],
    ['storage_path', '$path = \'\'', 'string', 'Get the path to the storage folder.'],
    ['database_path', '$path = \'\'', 'string', 'Get the database path.'],
    ['public_path', '$path = \'\'', 'string', 'Get the path to the public folder.'],
    ['resource_path', '$path = \'\'', 'string', 'Get the path to the resources folder.'],
    ['config_path', '$path = \'\'', 'string', 'Get the configuration path.'],
    ['trans', '$key = null, $replace = [], $locale = null', 'mixed', 'Translate the given message.'],
    ['__', '$key = null, $replace = [], $locale = null', 'mixed', 'Translate the given message.'],
    ['blank', '$value', 'bool', 'Determine if the given value is "blank".'],
    ['filled', '$value', 'bool', 'Determine if a value is "filled".'],
    ['class_basename', '$class', 'string', 'Get the class "basename" of the given object / class.'],
    ['e', '$value, $doubleEncode = true', 'string', 'Encode HTML special characters in a string.'],
    ['head', '$array', 'mixed', 'Get the first element of an array.'],
    ['last', '$array', 'mixed', 'Get the last element from an array.'],
    ['throw_if', '$condition, $exception = \'RuntimeException\', ...$parameters', 'mixed', 'Throw the given exception if the given condition is true.'],
    ['throw_unless', '$condition, $exception = \'RuntimeException\', ...$parameters', 'mixed', 'Throw the given exception unless the given condition is true.'],
    ['validator', 'array $data = [], array $rules = [], array $messages = [], array $attributes = []', 'Illuminate\\Contracts\\Validation\\Validator', 'Create a new Validator instance.'],
    ['to_route', '$route, $parameters = [], $status = 302, $headers = []', 'Illuminate\\Http\\RedirectResponse', 'Create a new redirect response to a named route.'],
    ['redirect', '$to = null, $status = 302, $headers = [], $secure = null', 'Illuminate\\Routing\\Redirector', 'Get an instance of the redirector.'],
    ['count', 'Countable|array $value, int $mode = COUNT_NORMAL', 'int', 'Counts all elements in an array or in a Countable object.'],
    ['array_map', '?callable $callback, array $array, array ...$arrays', 'array', 'Applies the callback to the elements of the given arrays.'],
    ['array_filter', 'array $array, ?callable $callback = null, int $mode = 0', 'array', 'Filters elements of an array using a callback function.'],
    ['array_keys', 'array $array, mixed $filter_value, bool $strict = false', 'array', 'Return all the keys or a subset of the keys of an array.'],
    ['array_values', 'array $array', 'array', 'Return all the values of an array.'],
    ['array_merge', 'array ...$arrays', 'array', 'Merge one or more arrays.'],
    ['array_column', 'array $array, int|string|null $column_key, int|string|null $index_key = null', 'array', 'Return the values from a single column in the input array.'],
    ['array_sum', 'array $array', 'int|float', 'Calculate the sum of values in an array.'],
    ['array_unique', 'array $array, int $flags = SORT_STRING', 'array', 'Removes duplicate values from an array.'],
    ['array_key_exists', '$key, array $array', 'bool', 'Checks if the given key or index exists in the array.'],
    ['array_slice', 'array $array, int $offset, ?int $length = null, bool $preserve_keys = false', 'array', 'Extract a slice of the array.'],
    ['array_search', 'mixed $needle, array $haystack, bool $strict = false', 'int|string|false', 'Searches the array for a given value.'],
    ['array_reverse', 'array $array, bool $preserve_keys = false', 'array', 'Return an array with elements in reverse order.'],
    ['array_combine', 'array $keys, array $values', 'array', 'Creates an array by using one array for keys and another for its values.'],
    ['array_flip', 'array $array', 'array', 'Exchanges all keys with their associated values in an array.'],
    ['array_push', 'array &$array, mixed ...$values', 'int', 'Push one or more elements onto the end of array.'],
    ['in_array', 'mixed $needle, array $haystack, bool $strict = false', 'bool', 'Checks if a value exists in an array.'],
    ['implode', 'array|string $separator, ?array $array', 'string', 'Join array elements with a string.'],
    ['explode', 'string $separator, string $string, int $limit = PHP_INT_MAX', 'array', 'Split a string by a string.'],
    ['json_encode', 'mixed $value, int $flags = 0, int $depth = 512', 'string|false', 'Returns the JSON representation of a value.'],
    ['json_decode', 'string $json, ?bool $associative = null, int $depth = 512, int $flags = 0', 'mixed', 'Decodes a JSON string.'],
    ['str_contains', 'string $haystack, string $needle', 'bool', 'Determine if a string contains a given substring.'],
    ['str_starts_with', 'string $haystack, string $needle', 'bool', 'Checks if a string starts with a given substring.'],
    ['str_ends_with', 'string $haystack, string $needle', 'bool', 'Checks if a string ends with a given substring.'],
    ['str_replace', 'array|string $search, array|string $replace, string|array $subject, &$count = null', 'string|array', 'Replace all occurrences of the search string with the replacement string.'],
    ['strlen', 'string $string', 'int', 'Get string length.'],
    ['strtolower', 'string $string', 'string', 'Make a string lowercase.'],
    ['strtoupper', 'string $string', 'string', 'Make a string uppercase.'],
    ['substr', 'string $string, int $offset, ?int $length = null', 'string', 'Return part of a string.'],
    ['sprintf', 'string $format, mixed ...$values', 'string', 'Return a formatted string.'],
    ['trim', 'string $string, string $characters = " \\n\\r\\t\\v\\x00"', 'string', 'Strip whitespace from the beginning and end of a string.'],
    ['ucfirst', 'string $string', 'string', 'Make a string\'s first character uppercase.'],
    ['preg_match', 'string $pattern, string $subject, &$matches = null, int $flags = 0, int $offset = 0', 'int|false', 'Perform a regular expression match.'],
    ['preg_replace', 'string|array $pattern, string|array $replacement, string|array $subject, int $limit = -1, &$count = null', 'string|array|null', 'Perform a regular expression search and replace.'],
    ['number_format', 'float $num, int $decimals = 0, ?string $decimal_separator = ".", ?string $thousands_separator = ","', 'string', 'Format a number with grouped thousands.'],
    ['round', 'int|float $num, int $precision = 0, int $mode = PHP_ROUND_HALF_UP', 'float', 'Rounds a float.'],
    ['var_dump', 'mixed $value, mixed ...$values', 'void', 'Dumps information about a variable.'],
    ['print_r', 'mixed $value, bool $return = false', 'string|bool', 'Prints human-readable information about a variable.'],
    ['is_null', 'mixed $value', 'bool', 'Finds whether a variable is null.'],
    ['is_array', 'mixed $value', 'bool', 'Finds whether a variable is an array.'],
    ['is_string', 'mixed $value', 'bool', 'Find whether the type of a variable is string.'],
    ['is_numeric', 'mixed $value', 'bool', 'Finds whether a variable is a number or a numeric string.'],
    ['date', 'string $format, ?int $timestamp = null', 'string', 'Format a Unix timestamp.'],
    ['time', '', 'int', 'Return current Unix timestamp.'],
    ['microtime', 'bool $as_float = false', 'string|float', 'Return current Unix timestamp with microseconds.'],
    ['sleep', 'int $seconds', 'int', 'Delay execution.'],
    ['usleep', 'int $microseconds', 'void', 'Delay execution in microseconds.'],
    ['range', '$start, $end, int|float $step = 1', 'array', 'Create an array containing a range of elements.'],
    ['random_int', 'int $min, int $max', 'int', 'Get a cryptographically secure, uniformly selected integer.'],
    ['uniqid', 'string $prefix = "", bool $more_entropy = false', 'string', 'Generate a time-based identifier.'],
    ['get_class', 'object $object', 'string', 'Returns the name of the class of an object.'],
    ['method_exists', '$object_or_class, string $method', 'bool', 'Checks if the class method exists.'],
    ['class_exists', 'string $class, bool $autoload = true', 'bool', 'Checks if the class has been defined.'],
    ['iterator_to_array', 'Traversable|array $iterator, bool $preserve_keys = true', 'array', 'Copy the iterator into an array.'],
    ['memory_get_usage', 'bool $real_usage = false', 'int', 'Returns the amount of memory allocated to PHP.'],
    ['file_get_contents', 'string $filename, bool $use_include_path = false, $context = null, int $offset = 0, ?int $length = null', 'string|false', 'Reads entire file into a string.'],
    ['file_put_contents', 'string $filename, mixed $data, int $flags = 0, $context = null', 'int|false', 'Write data to a file.'],
    ['base64_encode', 'string $string', 'string', 'Encodes data with MIME base64.'],
    ['base64_decode', 'string $string, bool $strict = false', 'string|false', 'Decodes data encoded with MIME base64.'],
    ['md5', 'string $string, bool $binary = false', 'string', 'Calculate the md5 hash of a string.'],
    ['hash', 'string $algo, string $data, bool $binary = false, array $options = []', 'string', 'Generate a hash value.'],
    ['intval', 'mixed $value, int $base = 10', 'int', 'Get the integer value of a variable.'],
    ['compact', '$var_name, ...$var_names', 'array', 'Create array containing variables and their values.'],
    ['usort', 'array &$array, callable $callback', 'true', 'Sort an array by values using a user-defined comparison function.'],
    ['ksort', 'array &$array, int $flags = SORT_REGULAR', 'true', 'Sort an array by key in ascending order.'],
    ['max', 'mixed $value, mixed ...$values', 'mixed', 'Find highest value.'],
    ['min', 'mixed $value, mixed ...$values', 'mixed', 'Find lowest value.']
].map(([name, params, returns, doc]) => ({ name, params, returns, doc }));
const helperMap = new Map(helperFunctions.map(f => [f.name.toLowerCase(), f]));

const phpKeywords = ['if', 'else', 'elseif', 'foreach', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'function', 'fn', 'new', 'use', 'try', 'catch', 'finally', 'throw', 'echo', 'print', 'match', 'isset', 'unset', 'empty', 'list', 'array', 'static', 'self', 'parent', 'true', 'false', 'null', 'instanceof', 'as', 'yield', 'global', 'const', 'clone', 'class', 'interface', 'trait', 'enum', 'abstract', 'final', 'public', 'private', 'protected', 'readonly', 'extends', 'implements', 'namespace', 'require', 'include'];
const builtinClasses = ['Exception', 'RuntimeException', 'InvalidArgumentException', 'LogicException', 'Throwable', 'Error', 'TypeError', 'DateTime', 'DateTimeImmutable', 'DateInterval', 'DateTimeZone', 'stdClass', 'ArrayObject', 'ArrayIterator', 'Closure', 'Generator', 'SplObjectStorage', 'JsonSerializable', 'Stringable', 'Countable', 'IteratorAggregate', 'Traversable', 'PDO', 'ReflectionClass', 'WeakMap'];
const snippets = [
    ['foreach', 'foreach (${1:\\$items} as ${2:\\$item}) {\n\t$0\n}', 'foreach (...) { }'],
    ['foreachk', 'foreach (${1:\\$items} as ${2:\\$key} => ${3:\\$value}) {\n\t$0\n}', 'foreach (... as $key => $value) { }'],
    ['if', 'if (${1:condition}) {\n\t$0\n}', 'if (...) { }'],
    ['ifelse', 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}', 'if (...) { } else { }'],
    ['try', 'try {\n\t$1\n} catch (${2:\\Throwable} ${3:\\$e}) {\n\t$0\n}', 'try { } catch { }'],
    ['fn', 'fn(${1:\\$item}) => $0', 'fn() =>'],
    ['function', 'function (${1}) {\n\t$0\n}', 'function () { }'],
    ['match', 'match (${1:\\$value}) {\n\t${2:default} => $0,\n}', 'match (...) { }'],
    ['dbtx', 'DB::transaction(function () {\n\t$0\n});', 'DB::transaction'],
    ['tap', 'tap(${1:\\$value}, function (${2:\\$item}) {\n\t$0\n});', 'tap()']
];

export function setContextProvider(fn) {
    contextProvider = fn;
}

function projectEntry(project) {
    const key = String(project || '').toLowerCase();
    if (!projects.has(key)) projects.set(key, { project, classes: new Map(), list: [], details: new Map(), loading: null, loaded: false, rev: '', checkedAt: 0, refreshing: null });
    return projects.get(key);
}

const STALE_MS = 2000;
const REFRESH_WAIT_MS = 250;

async function fetchIndex(entry, force) {
    const rev = !force && entry.loaded ? entry.rev || undefined : undefined;
    entry.checkedAt = Date.now();
    const data = await api('/api/index?' + query({ project: entry.project, force: force ? '1' : undefined, rev }));
    if (!data?.ok) throw new Error(data?.error || 'index');
    if (data.unchanged) return false;
    entry.classes = new Map();
    entry.list = data.classes.map(([name, kind, origin]) => {
        const cut = name.lastIndexOf('\\');
        const item = { name, kind, short: name.slice(cut + 1), ns: cut > 0 ? name.slice(0, cut) : '', lowerShort: name.slice(cut + 1).toLowerCase(), own: origin === 'p' };
        entry.classes.set(name.toLowerCase(), item);
        return item;
    });
    entry.rev = data.rev || '';
    if (force) entry.details.clear();
    else {
        for (const key of [...entry.details.keys()]) {
            const item = entry.classes.get(key);
            if (!item || item.own) entry.details.delete(key);
        }
    }
    entry.loaded = true;
    return true;
}

export function loadIndex(project, force = false) {
    if (!project) return Promise.resolve(null);
    const entry = projectEntry(project);
    if (entry.loading && !force) return entry.loading;
    if (entry.loaded && !force) return Promise.resolve(entry);
    const job = fetchIndex(entry, force).then(() => {
        if (entry.loading === job) entry.loading = null;
        bus.emit('index', { project, status: 'ready', count: entry.list.length });
        return entry;
    }, error => {
        if (entry.loading === job) entry.loading = null;
        bus.emit('index', { project, status: 'error', error });
        return null;
    });
    entry.loading = job;
    bus.emit('index', { project, status: 'loading' });
    return job;
}

export function refreshIndex(project) {
    const entry = project ? projects.get(String(project).toLowerCase()) : null;
    if (!entry?.loaded) return Promise.resolve(null);
    if (entry.loading) return entry.loading;
    if (!entry.refreshing) {
        entry.refreshing = fetchIndex(entry, false).then(changed => {
            if (changed) bus.emit('index', { project, status: 'ready', count: entry.list.length });
            return entry;
        }).catch(() => entry).finally(() => { entry.refreshing = null; });
    }
    return entry.refreshing;
}

export function indexInfo(project) {
    const entry = projects.get(String(project || '').toLowerCase());
    return entry ? { loaded: entry.loaded, count: entry.list.length, loading: !!entry.loading } : null;
}

async function ensureIndex(project) {
    const entry = projectEntry(project);
    if (!entry.loaded) await loadIndex(project);
    else if (Date.now() - entry.checkedAt > STALE_MS) await Promise.race([refreshIndex(project), new Promise(resolve => setTimeout(resolve, REFRESH_WAIT_MS))]);
    return entry;
}

export function classDetails(project, name) {
    if (!project || !name) return Promise.resolve(null);
    const entry = projectEntry(project);
    const key = name.replace(/^\\/, '').toLowerCase();
    if (!entry.details.has(key)) {
        entry.details.set(key, api('/api/class?' + query({ project, name: name.replace(/^\\/, '') })).then(d => d?.ok ? d : null).catch(() => null));
    }
    return entry.details.get(key);
}

function parseImports(text) {
    const imports = new Map();
    const re = /^\s*use\s+(?!function\b|const\b)([^;{(]+?)(?:\{([^}]*)\})?\s*;/gm;
    let m;
    while ((m = re.exec(text))) {
        if (m[2] !== undefined) {
            const prefix = m[1].trim().replace(/\\$/, '');
            for (const part of m[2].split(',')) addImport(imports, prefix + '\\' + part.trim());
        } else {
            for (const part of m[1].split(',')) addImport(imports, part.trim());
        }
    }
    return imports;
}

function addImport(imports, raw) {
    if (!raw) return;
    const as = raw.match(/^(.+?)\s+as\s+([A-Za-z_]\w*)$/i);
    const fqcn = (as ? as[1] : raw).trim().replace(/^\\/, '');
    const alias = as ? as[2] : fqcn.split('\\').pop();
    imports.set(alias.toLowerCase(), fqcn);
}

function resolveClassName(entry, token, text) {
    if (!token) return '';
    const clean = token.replace(/^\\/, '');
    const lower = clean.toLowerCase();
    if (['self', 'static', 'parent'].includes(lower)) return '';
    if (!token.startsWith('\\')) {
        const imports = parseImports(text);
        const [first, ...rest] = clean.split('\\');
        const imported = imports.get(first.toLowerCase());
        if (imported) return rest.length ? imported + '\\' + rest.join('\\') : imported;
    }
    if (entry.classes.has(lower)) return entry.classes.get(lower).name;
    if (!clean.includes('\\')) {
        const candidates = entry.list.filter(item => item.lowerShort === lower);
        const pick = candidates.find(c => c.kind === 'model') || candidates.find(c => c.name.startsWith('Illuminate\\Support\\Facades\\')) || candidates.find(c => c.own) || candidates[0];
        if (pick) return pick.name;
    }
    return clean;
}

function skipStringBack(src, i) {
    const quote = src[i];
    let j = i - 1;
    while (j >= 0) {
        if (src[j] === quote && src[j - 1] !== '\\') return j - 1;
        j--;
    }
    return -1;
}

function matchBack(src, i) {
    const open = src[i] === ')' ? '(' : src[i] === ']' ? '[' : '{';
    const close = src[i];
    let depth = 0;
    for (let j = i; j >= 0; j--) {
        const c = src[j];
        if (c === '"' || c === "'") {
            j = skipStringBack(src, j) + 1;
            continue;
        }
        if (c === close) depth++;
        else if (c === open) {
            depth--;
            if (depth === 0) return j;
        }
    }
    return -1;
}

function matchForward(src, i) {
    const open = src[i];
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        const c = src[j];
        if (c === '"' || c === "'") {
            let k = j + 1;
            while (k < src.length && !(src[k] === c && src[k - 1] !== '\\')) k++;
            j = k;
            continue;
        }
        if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) return j;
        }
    }
    return src.length - 1;
}

export function extractChain(src) {
    let i = src.length - 1;
    const isId = c => /[A-Za-z0-9_\\$]/.test(c || '');
    while (i >= 0) {
        while (i >= 0 && /\s/.test(src[i])) i--;
        if (i < 0) break;
        const c = src[i];
        if (c === ')' || c === ']') {
            const open = matchBack(src, i);
            if (open < 0) return '';
            i = open - 1;
            let k = i;
            while (k >= 0 && /\s/.test(src[k])) k--;
            if (k < 0 || !isId(src[k])) {
                i = open - 1;
                break;
            }
            i = k;
            continue;
        }
        if (isId(c)) {
            while (i >= 0 && isId(src[i])) i--;
            let j = i;
            while (j >= 0 && /\s/.test(src[j])) j--;
            if (src[j] === '>' && src[j - 1] === '-') {
                i = src[j - 2] === '?' ? j - 3 : j - 2;
                continue;
            }
            if (src[j] === ':' && src[j - 1] === ':') {
                i = j - 2;
                continue;
            }
            const before = src.slice(0, j + 1);
            const newMatch = before.match(/\bnew\s*$/);
            if (newMatch) i = j - newMatch[0].length;
            break;
        }
        break;
    }
    return src.slice(i + 1).trim();
}

function parseChain(expr) {
    let s = String(expr || '').trim();
    let base = null;
    let rest = '';
    let m;
    if (s.startsWith('(')) {
        const close = matchForward(s, 0);
        const inner = s.slice(1, close).trim();
        const nm = inner.match(/^new\s+(\\?[A-Za-z_][\w\\]*)/);
        if (!nm) return null;
        base = { kind: 'new', name: nm[1] };
        rest = s.slice(close + 1);
    } else if ((m = s.match(/^new\s+(\\?[A-Za-z_][\w\\]*)\s*/))) {
        base = { kind: 'new', name: m[1] };
        rest = s.slice(m[0].length);
        if (rest.startsWith('(')) rest = rest.slice(matchForward(rest, 0) + 1);
    } else if ((m = s.match(/^\$([A-Za-z_]\w*)/))) {
        base = { kind: 'var', name: m[1] };
        rest = s.slice(m[0].length);
    } else if ((m = s.match(/^(\\?[A-Za-z_][\w\\]*)(?=\s*(?:::|$))/))) {
        base = { kind: 'class', name: m[1] };
        rest = s.slice(m[0].length);
    } else if ((m = s.match(/^(\\?[A-Za-z_][\w\\]*)\s*\(/))) {
        base = { kind: 'func', name: m[1] };
        rest = s.slice(matchForward(s, m[0].length - 1) + 1);
    } else {
        return null;
    }
    const members = [];
    while (rest.trim()) {
        const mm = rest.match(/^\s*(\?->|->|::)\s*(\$?[A-Za-z_]\w*)\s*/);
        if (!mm) {
            const index = rest.match(/^\s*\[/);
            if (index) {
                rest = rest.slice(matchForward(rest, rest.indexOf('[')) + 1);
                members.push({ op: '[]', name: '', call: false });
                continue;
            }
            return null;
        }
        rest = rest.slice(mm[0].length);
        const call = rest.startsWith('(');
        let args = '';
        if (call) {
            const close = matchForward(rest, 0);
            args = rest.slice(1, close);
            rest = rest.slice(close + 1);
        }
        members.push({ op: mm[1] === '?->' ? '->' : mm[1], name: mm[2], call, args });
    }
    return { base, members };
}

const isBuilder = cls => /\\Eloquent\\(Builder|Relations\\\w+)$/.test(cls || '');
const isCollection = cls => /\\(Eloquent\\Collection|Support\\Collection|Support\\LazyCollection)$/.test(cls || '') || /\\Pagination\\\w*Paginator$/.test(cls || '');
const builtinReturn = new Set(['array', 'string', 'int', 'integer', 'bool', 'boolean', 'float', 'double', 'mixed', 'void', 'null', 'false', 'true', 'callable', 'iterable', 'object', 'never', 'resource', 'scalar', 'array-key', 'list', 'class-string', 'non-empty-string', 'positive-int']);

function resolveReturn(ret, type, entry) {
    if (!ret) return null;
    const parts = String(ret).split('|').map(p => p.trim()).filter(p => p && !['null', 'false', 'void', 'never'].includes(p.toLowerCase()));
    for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower === '$this' || lower === 'static') return { cls: type.cls, gen: type.gen, static: false };
        if (/^T[A-Z]?\w*$/.test(part)) {
            if (type.gen && /^T(Model|Value|RelatedModel|Declaring)?$/.test(part)) return { cls: type.gen, gen: '', static: false };
            continue;
        }
        if (builtinReturn.has(lower) || part.endsWith('[]')) continue;
        const cls = part.replace(/^\\/, '');
        return { cls, gen: isBuilder(cls) || isCollection(cls) ? type.gen : '', static: false };
    }
    return null;
}

function findMethod(detail, name) {
    const lower = name.toLowerCase();
    return detail?.methods?.find(m => m.name.toLowerCase() === lower) || null;
}

async function membersOf(project, cls, depth = 0) {
    const detail = await classDetails(project, cls);
    if (!detail) return { detail: null, methods: [] };
    let methods = [...detail.methods];
    if (depth < 2 && detail.mixins?.length) {
        const seen = new Set(methods.map(m => m.name.toLowerCase()));
        for (const mixin of detail.mixins) {
            const extra = await membersOf(project, mixin, depth + 1);
            for (const m of extra.methods) {
                if (!seen.has(m.name.toLowerCase())) {
                    seen.add(m.name.toLowerCase());
                    methods.push({ ...m, forwarded: true });
                }
            }
        }
    }
    return { detail, methods };
}

async function memberType(project, entry, type, member) {
    if (!type?.cls || member.op === '[]') {
        if (member.op === '[]' && type && isCollection(type.cls) && type.gen) return { cls: type.gen, gen: '', static: false };
        return null;
    }
    const name = member.name;
    const lower = name.toLowerCase();
    if (member.op === '::') {
        if (lower === 'class') return null;
        const detail = await classDetails(project, type.cls);
        if (detail?.isModel) {
            const own = findMethod(detail, name);
            if (own && own.static && own.owner !== 'Model' && own.returns) return resolveReturn(own.returns, { cls: type.cls, gen: type.cls }, entry);
            if (modelResult.has(lower)) return { cls: type.cls, gen: '', static: false };
            if (collectionResult.has(lower)) return { cls: EC, gen: type.cls, static: false };
            if (paginatorResult.has(lower)) return { cls: PAGINATOR, gen: type.cls, static: false };
            if (scalarResult.has(lower)) return lower === 'pluck' ? { cls: SC, gen: '', static: false } : null;
            return { cls: EB, gen: type.cls, static: false };
        }
        const { methods } = await membersOf(project, type.cls);
        const method = methods.find(m => m.name.toLowerCase() === lower);
        return method ? resolveReturn(method.returns, { cls: type.cls, gen: type.gen }, entry) : null;
    }
    if (isBuilder(type.cls)) {
        if (modelResult.has(lower)) return type.gen ? { cls: type.gen, gen: '', static: false } : null;
        if (collectionResult.has(lower) || lower === 'cursor' || lower === 'lazy') return { cls: EC, gen: type.gen, static: false };
        if (paginatorResult.has(lower)) return { cls: PAGINATOR, gen: type.gen, static: false };
        if (lower === 'pluck') return { cls: SC, gen: '', static: false };
        if (scalarResult.has(lower)) return null;
        const { methods } = await membersOf(project, type.cls === EB ? EB : type.cls);
        const method = methods.find(m => m.name.toLowerCase() === lower);
        if (method) {
            const resolved = resolveReturn(method.returns, type, entry);
            if (resolved && (resolved.cls === QB || isBuilder(resolved.cls))) return { cls: isBuilder(type.cls) ? type.cls : EB, gen: type.gen, static: false };
            if (resolved) return resolved;
        }
        return { cls: type.cls, gen: type.gen, static: false };
    }
    if (isCollection(type.cls)) {
        if (elementResult.has(lower) && type.gen) return { cls: type.gen, gen: '', static: false };
        if (sameCollection.has(lower)) return { cls: type.cls, gen: type.gen, static: false };
        if (['map', 'pluck', 'keys', 'mapwithkeys', 'flatmap', 'groupby', 'collapse', 'flatten', 'zip', 'countby', 'mapinto', 'mapspread', 'partition', 'chunkwhile', 'split', 'tobase'].includes(lower)) return { cls: SC, gen: '', static: false };
        if (lower === 'items' || lower === 'getcollection') return { cls: SC, gen: type.gen, static: false };
        const { methods } = await membersOf(project, type.cls);
        const method = methods.find(m => m.name.toLowerCase() === lower);
        return method ? resolveReturn(method.returns, type, entry) : null;
    }
    const detail = await classDetails(project, type.cls);
    if (detail?.isModel) {
        const relation = detail.relations.find(r => r.name.toLowerCase() === lower);
        if (relation) {
            if (member.call) return { cls: EB, gen: relation.related || '', static: false };
            return relation.many ? { cls: EC, gen: relation.related || '', static: false } : relation.related ? { cls: relation.related, gen: '', static: false } : null;
        }
        if (!member.call) return null;
        if (['fresh', 'refresh', 'replicate', 'load', 'loadmissing', 'loadcount', 'fill', 'forcefill', 'setattribute', 'makehidden', 'makevisible', 'withoutrelations', 'setrelation', 'unsetrelation'].includes(lower)) return { cls: type.cls, gen: '', static: false };
    }
    if (/AuthManager$|\\Guard$|SessionGuard$/.test(type.cls) && lower === 'user') {
        const user = entry.classes.get('app\\models\\user');
        if (user) return { cls: user.name, gen: '', static: false };
    }
    if (!member.call) return null;
    const { methods } = await membersOf(project, type.cls);
    const method = methods.find(m => m.name.toLowerCase() === lower);
    return method ? resolveReturn(method.returns, type, entry) : null;
}

function statementEnd(text, start) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === "'") {
            let k = i + 1;
            while (k < text.length && !(text[k] === c && text[k - 1] !== '\\')) k++;
            i = k;
            continue;
        }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            if (depth === 0) return i;
            depth--;
        } else if (c === ';' && depth === 0) return i;
    }
    return text.length;
}

async function inferVariable(project, entry, name, text, depth) {
    if (depth > 5) return null;
    const candidates = [];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assign = new RegExp('\\$' + escaped + '\\s*=(?![=>])\\s*', 'g');
    let m;
    while ((m = assign.exec(text))) {
        const start = m.index + m[0].length;
        const end = statementEnd(text, start);
        if (end <= start) continue;
        candidates.push({ index: m.index, kind: 'assign', expr: text.slice(start, end) });
    }
    const foreachRe = new RegExp('foreach\\s*\\(([\\s\\S]+?)\\s+as\\s+(?:\\$\\w+\\s*=>\\s*)?&?\\$' + escaped + '\\s*\\)', 'g');
    while ((m = foreachRe.exec(text))) candidates.push({ index: m.index, kind: 'foreach', expr: m[1] });
    const paramRe = new RegExp('(?:\\(|,)\\s*\\??(\\\\?[A-Za-z_][\\w\\\\]*)\\s+&?(?:\\.\\.\\.)?\\$' + escaped + '\\b', 'g');
    while ((m = paramRe.exec(text))) {
        if (!builtinReturn.has(m[1].toLowerCase())) candidates.push({ index: m.index, kind: 'param', cls: m[1] });
    }
    const docRe = new RegExp('@var\\s+(\\\\?[A-Za-z_][\\w\\\\]*)\\s+\\$' + escaped + '\\b', 'g');
    while ((m = docRe.exec(text))) candidates.push({ index: m.index, kind: 'param', cls: m[1] });
    candidates.sort((a, b) => b.index - a.index);
    for (const candidate of candidates) {
        if (candidate.kind === 'param') {
            const cls = resolveClassName(entry, candidate.cls, text);
            if (cls) return { cls, gen: '', static: false };
            continue;
        }
        const before = text.slice(0, candidate.index);
        if (candidate.kind === 'assign') {
            const type = await inferExpression(project, entry, candidate.expr.trim(), before, depth + 1);
            if (type) return { ...type, static: false };
            continue;
        }
        const type = await inferExpression(project, entry, candidate.expr.trim(), before, depth + 1);
        if (type && isCollection(type.cls) && type.gen) return { cls: type.gen, gen: '', static: false };
        if (type && isBuilder(type.cls) && type.gen) return { cls: type.gen, gen: '', static: false };
    }
    return null;
}

const helperTypes = {
    collect: SC, now: 'Illuminate\\Support\\Carbon', today: 'Illuminate\\Support\\Carbon', request: 'Illuminate\\Http\\Request',
    auth: 'Illuminate\\Auth\\AuthManager', cache: 'Illuminate\\Cache\\CacheManager', app: 'Illuminate\\Foundation\\Application',
    str: 'Illuminate\\Support\\Stringable', logger: 'Illuminate\\Log\\LogManager', response: 'Illuminate\\Routing\\ResponseFactory',
    redirect: 'Illuminate\\Routing\\Redirector', session: 'Illuminate\\Session\\SessionManager', fake: 'Faker\\Generator', url: 'Illuminate\\Routing\\UrlGenerator'
};

async function inferExpression(project, entry, expr, text, depth = 0) {
    if (depth > 6) return null;
    const chain = parseChain(expr);
    if (!chain) return null;
    let type = null;
    const base = chain.base;
    if (base.kind === 'class') {
        const cls = resolveClassName(entry, base.name, text);
        type = cls ? { cls, gen: '', static: true } : null;
    } else if (base.kind === 'new') {
        const cls = resolveClassName(entry, base.name, text);
        type = cls ? { cls, gen: '', static: false } : null;
    } else if (base.kind === 'var') {
        if (base.name === 'this') return null;
        type = await inferVariable(project, entry, base.name, text, depth);
    } else if (base.kind === 'func') {
        const cls = helperTypes[base.name.replace(/^\\/, '').toLowerCase()];
        type = cls ? { cls, gen: '', static: false } : null;
    }
    for (const member of chain.members) {
        if (!type) return null;
        type = await memberType(project, entry, type, member);
    }
    return type;
}

function inStringOrComment(text) {
    let state = '';
    let quote = '';
    let start = -1;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const n = text[i + 1];
        if (state === 'line') {
            if (c === '\n') state = '';
            continue;
        }
        if (state === 'block') {
            if (c === '*' && n === '/') {
                state = '';
                i++;
            }
            continue;
        }
        if (state === 'string') {
            if (c === '\\') {
                i++;
                continue;
            }
            if (c === quote) state = '';
            continue;
        }
        if (c === '/' && n === '/') state = 'line';
        else if (c === '#' && n !== '[') state = 'line';
        else if (c === '/' && n === '*') {
            state = 'block';
            i++;
        } else if (c === '"' || c === "'" || c === '`') {
            state = 'string';
            quote = c;
            start = i;
        }
    }
    return { state, quote, start };
}

function insertImportEdit(monaco, model, fqcn) {
    const text = model.getValue();
    const imports = parseImports(text);
    if ([...imports.values()].some(v => v.toLowerCase() === fqcn.toLowerCase())) return [];
    const lines = text.split('\n');
    let phpOpen = 0;
    let lastUse = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^<\?php/.test(line)) {
            phpOpen = i + 1;
            continue;
        }
        if (/^use\s+[^;(]+;/.test(line)) {
            lastUse = i + 1;
            continue;
        }
        if (line === '' || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*') || line.startsWith('*')) continue;
        break;
    }
    const at = lastUse || phpOpen;
    const next = (lines[at] ?? '').trim();
    const suffix = !lastUse && next !== '' ? '\n' : '';
    return [{ range: new monaco.Range(at + 1, 1, at + 1, 1), text: `use ${fqcn};\n${suffix}` }];
}

function paramNames(params) {
    return splitParams(params).map(p => (p.match(/(?:\.\.\.)?&?\$\w+/) || [p.trim()])[0]).filter(Boolean).join(', ');
}

function splitParams(params) {
    const out = [];
    let depth = 0;
    let current = '';
    let quote = '';
    for (const c of String(params || '')) {
        if (quote) {
            current += c;
            if (c === quote) quote = '';
            continue;
        }
        if (c === '"' || c === "'") quote = c;
        if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
        if (c === ')' || c === ']' || c === '}' || c === '>') depth--;
        if (c === ',' && depth === 0) {
            out.push(current.trim());
            current = '';
            continue;
        }
        current += c;
    }
    if (current.trim()) out.push(current.trim());
    return out;
}

function methodDoc(method, ownerName) {
    const sig = `${method.static ? 'static ' : ''}function ${method.name}(${method.params || ''})${method.returns ? ': ' + method.returns : ''}`;
    const lines = ['```php', sig, '```'];
    if (method.doc) lines.push(method.doc);
    if (method.owner || ownerName) lines.push(`*${method.owner || shortClass(ownerName)}*`);
    return lines.join('\n\n');
}

function concreteType(type, gen) {
    return gen ? String(type || '').replace(/\bT(Model|Value|RelatedModel)\b/g, shortClass(gen)) : String(type || '');
}

function methodItem(monaco, method, range, sortGroup, extra = {}) {
    const hasParams = String(method.params || '').trim() !== '';
    if (extra.gen) method = { ...method, returns: concreteType(method.returns, extra.gen) };
    return {
        label: { label: method.name, detail: `(${paramNames(method.params)})`, description: shortClass(method.returns || '') },
        kind: method.kindOverride ?? monaco.languages.CompletionItemKind.Method,
        insertText: hasParams ? `${method.name}($0)` : `${method.name}()`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: `${sortGroup}${method.name.toLowerCase()}`,
        filterText: method.name,
        documentation: { value: methodDoc(method, extra.ownerName) },
        command: hasParams ? { id: 'editor.action.triggerParameterHints', title: '' } : undefined,
        ...extra.item
    };
}

function classKind(monaco, kind) {
    const K = monaco.languages.CompletionItemKind;
    return { interface: K.Interface, trait: K.Module, enum: K.Enum, model: K.Class, facade: K.Class, exception: K.Class }[kind] ?? K.Class;
}

async function memberItems(monaco, project, entry, type, op, range) {
    const K = monaco.languages.CompletionItemKind;
    const items = [];
    const seen = new Set();
    const push = item => {
        const key = (typeof item.label === 'string' ? item.label : item.label.label) + ':' + item.kind;
        if (seen.has(key)) return;
        seen.add(key);
        items.push(item);
    };
    const common = new Set(commonBuilder.map(n => n.toLowerCase()));
    const useful = m => !m.name.startsWith('__') && !/^(boot|initialize)[A-Z]/.test(m.name);
    if (op === '::') {
        const { detail, methods } = await membersOf(project, type.cls);
        if (!detail) return items;
        for (const m of methods.filter(m => (m.static || detail.isFacade) && useful(m))) push(methodItem(monaco, m, range, m.owner === shortClass(detail.name) ? '0' : '2', { ownerName: detail.name }));
        if (detail.isModel) {
            for (const scope of detail.scopes) push(methodItem(monaco, { name: scope, params: '...$parameters', returns: EB, doc: t('isScope') }, range, '0', { ownerName: detail.name }));
            const builder = await membersOf(project, EB);
            for (const m of builder.methods.filter(useful)) push(methodItem(monaco, m, range, common.has(m.name.toLowerCase()) ? '1' : '3', { ownerName: EB, gen: detail.name }));
        }
        for (const c of detail.constants) push({ label: c, kind: detail.kind === 'enum' ? K.EnumMember : K.Constant, insertText: c, range, sortText: '1' + c.toLowerCase(), detail: `${shortClass(detail.name)}::${c}` });
        push({ label: 'class', kind: K.Keyword, insertText: 'class', range, sortText: '9class' });
        return items;
    }
    if (isBuilder(type.cls)) {
        const model = type.gen ? await classDetails(project, type.gen) : null;
        if (model) for (const scope of model.scopes) push(methodItem(monaco, { name: scope, params: '...$parameters', returns: EB, doc: t('isScope') }, range, '0', { ownerName: model.name }));
        const { methods } = await membersOf(project, type.cls);
        for (const m of methods.filter(m => useful(m) && (!m.static || m.forwarded))) push(methodItem(monaco, m, range, common.has(m.name.toLowerCase()) ? '1' : m.forwarded ? '3' : '2', { gen: type.gen }));
        if (type.cls !== EB) {
            const builder = await membersOf(project, EB);
            for (const m of builder.methods.filter(useful)) push(methodItem(monaco, m, range, common.has(m.name.toLowerCase()) ? '1' : '3', { gen: type.gen }));
        }
        return items;
    }
    const { detail, methods } = await membersOf(project, type.cls);
    if (!detail) return items;
    if (detail.isModel) {
        const fillable = new Set(detail.fillable);
        for (const attr of detail.attributes) push({ label: { label: attr, description: fillable.has(attr) ? 'fillable' : t('attribute') }, kind: K.Field, insertText: attr, range, sortText: '0' + attr, detail: `${shortClass(detail.name)}::$${attr}` });
        for (const rel of detail.relations) {
            const target = rel.related ? shortClass(rel.related) : '';
            push({ label: { label: rel.name, description: `${rel.type}${target ? ' ' + target : ''}` }, kind: K.Property, insertText: rel.name, range, sortText: '1' + rel.name, detail: rel.many ? `Collection<${target || 'Model'}>` : target, documentation: { value: `**${rel.type}** → \`${rel.related || '?'}\`` } });
        }
    } else {
        for (const prop of [...detail.properties, ...detail.attributes]) push({ label: prop, kind: K.Property, insertText: prop, range, sortText: '1' + prop, detail: shortClass(detail.name) });
    }
    const ownShort = shortClass(detail.name);
    for (const m of methods.filter(m => !m.static && useful(m))) {
        const group = m.owner === ownShort ? '0' : isCollection(type.cls) && sameCollection.has(m.name.toLowerCase()) ? '1' : '2';
        push(methodItem(monaco, m, range, group, { ownerName: detail.name, gen: type.gen }));
    }
    return items;
}

function classMatches(item, prefix) {
    if (!prefix) return true;
    const p = prefix.toLowerCase();
    if (item.lowerShort.startsWith(p)) return true;
    if (item.lowerShort[0] !== p[0]) return false;
    let i = 0;
    for (const c of item.lowerShort) {
        if (c === p[i]) i++;
        if (i === p.length) return true;
    }
    return false;
}

function classItems(monaco, entry, model, prefix, range, { qualified = false, inUse = false } = {}) {
    const items = [];
    const text = model.getValue();
    const imports = parseImports(text);
    const importedLower = new Set([...imports.values()].map(v => v.toLowerCase()));
    if (qualified || inUse) {
        const typed = prefix.replace(/^\\/, '');
        const lower = typed.toLowerCase();
        const cut = lower.lastIndexOf('\\');
        const nsPrefix = cut >= 0 ? lower.slice(0, cut) : '';
        const leaf = cut >= 0 ? lower.slice(cut + 1) : lower;
        const namespaces = new Set();
        let count = 0;
        for (const item of entry.list) {
            const name = item.name.toLowerCase();
            if (!name.startsWith(nsPrefix ? nsPrefix + '\\' : '')) continue;
            const remainder = item.name.slice(nsPrefix ? nsPrefix.length + 1 : 0);
            const segment = remainder.split('\\')[0];
            if (!segment.toLowerCase().startsWith(leaf)) continue;
            if (remainder.includes('\\')) {
                const ns = (nsPrefix ? item.name.slice(0, nsPrefix.length + 1) : '') + segment;
                if (!namespaces.has(ns)) {
                    namespaces.add(ns);
                    items.push({ label: segment, kind: monaco.languages.CompletionItemKind.Module, insertText: (prefix.startsWith('\\') ? '\\' : '') + ns + '\\', range, sortText: '1' + segment.toLowerCase(), detail: ns, command: { id: 'editor.action.triggerSuggest', title: '' } });
                }
                continue;
            }
            if (count++ > 300) continue;
            items.push({ label: { label: item.short, description: item.name }, kind: classKind(monaco, item.kind), insertText: (prefix.startsWith('\\') ? '\\' : '') + item.name, range, sortText: (item.own ? '0' : '2') + item.lowerShort, detail: item.name, filterText: (prefix.startsWith('\\') ? '\\' : '') + item.name });
        }
        return items;
    }
    const candidates = [];
    for (const item of entry.list) {
        if (classMatches(item, prefix)) candidates.push(item);
        if (candidates.length > 400) break;
    }
    candidates.sort((a, b) => (b.lowerShort.startsWith(prefix.toLowerCase()) - a.lowerShort.startsWith(prefix.toLowerCase())) || (b.own - a.own) || (a.short.length - b.short.length));
    for (const item of candidates.slice(0, 160)) {
        const aliasOwner = imports.get(item.lowerShort);
        const imported = importedLower.has(item.name.toLowerCase());
        const conflict = aliasOwner && aliasOwner.toLowerCase() !== item.name.toLowerCase();
        const insert = conflict ? '\\' + item.name : item.short;
        items.push({
            label: { label: item.short, description: item.name },
            kind: classKind(monaco, item.kind),
            insertText: insert,
            range,
            sortText: (item.kind === 'model' ? '0' : item.own ? '1' : imported ? '1' : '3') + item.lowerShort,
            filterText: item.short,
            detail: item.name,
            documentation: { value: `${item.kind === 'model' ? 'Eloquent model' : item.kind}${imported ? ' · ' + t('imported') : conflict ? '' : ' · ' + t('autoImport')}` },
            additionalTextEdits: imported || conflict || !item.name.includes('\\') ? undefined : insertImportEdit(monaco, model, item.name)
        });
    }
    for (const name of builtinClasses) {
        if (name.toLowerCase().startsWith(prefix.toLowerCase())) items.push({ label: { label: name, description: 'PHP' }, kind: monaco.languages.CompletionItemKind.Class, insertText: name, range, sortText: '4' + name.toLowerCase(), detail: name });
    }
    return items;
}

function globalItems(monaco, model, prefix, range, context) {
    const K = monaco.languages.CompletionItemKind;
    const items = [];
    const p = prefix.toLowerCase();
    for (const fn of helperFunctions) {
        if (!fn.name.toLowerCase().startsWith(p[0] || '')) continue;
        items.push(methodItem(monaco, { ...fn, kindOverride: K.Function }, range, '2'));
    }
    for (const keyword of phpKeywords) {
        if (keyword.startsWith(p[0] || '')) items.push({ label: keyword, kind: K.Keyword, insertText: keyword, range, sortText: '5' + keyword });
    }
    for (const [name, body, label] of snippets) {
        if (name.startsWith(p[0] || '')) items.push({ label: { label: name, description: label }, kind: K.Snippet, insertText: body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: '6' + name, documentation: { value: '```php\n' + body.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$\d/g, '').replace(/\\\$/g, '$') + '\n```' } });
    }
    return items;
}

function variableItems(monaco, model, position, range, context) {
    const K = monaco.languages.CompletionItemKind;
    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    const names = new Map();
    const re = /\$([A-Za-z_]\w*)/g;
    let m;
    while ((m = re.exec(text))) {
        if (m.index <= offset && m.index + m[0].length >= offset) continue;
        if (!names.has(m[1])) names.set(m[1], 'document');
    }
    for (const v of context.publicVariables || []) if (/^[A-Za-z_]\w*$/.test(v)) names.set(v, 'environment');
    for (const v of context.variables || []) if (v) names.set(v, 'request');
    names.set('this', 'keyword');
    return [...names.entries()].map(([name, source]) => ({
        label: { label: '$' + name, description: source === 'request' ? t('requestVariable') : source === 'environment' ? t('environmentVariable') : '' },
        kind: source === 'keyword' ? K.Keyword : K.Variable,
        insertText: '$' + name,
        range,
        sortText: (source === 'request' || source === 'environment' ? '0' : source === 'keyword' ? '9' : '1') + name.toLowerCase(),
        filterText: '$' + name
    }));
}

async function stringArgumentItems(monaco, project, entry, model, textBefore, range) {
    const K = monaco.languages.CompletionItemKind;
    let match = textBefore.match(stringColumnMethods);
    let mode = 'column';
    if (!match) {
        match = textBefore.match(stringRelationMethods);
        mode = 'relation';
    }
    if (!match) return null;
    const callStart = textBefore.length - match[0].length;
    const chainText = textBefore.slice(0, callStart);
    const chain = extractChain(chainText);
    let type = await inferExpression(project, entry, chain, chainText.slice(0, chainText.length - chain.length));
    if (!type) return null;
    const op = match[0].trim().startsWith('::') ? '::' : '->';
    if (op === '::' && type.static) type = { cls: type.cls, gen: type.cls, static: false };
    const modelName = type.gen || type.cls;
    const detail = await classDetails(project, modelName);
    if (!detail?.isModel) return null;
    if (mode === 'relation') {
        return detail.relations.map(rel => ({ label: { label: rel.name, description: `${rel.type} ${shortClass(rel.related || '')}` }, kind: K.Reference, insertText: rel.name, range, sortText: '0' + rel.name }));
    }
    const fillable = new Set(detail.fillable);
    const columns = new Set(['id', ...detail.attributes, 'created_at', 'updated_at']);
    return [...columns].map(column => ({ label: { label: column, description: fillable.has(column) ? 'fillable' : t('attribute') }, kind: K.Field, insertText: column, range, sortText: (fillable.has(column) ? '0' : '1') + column }));
}

async function provideCompletion(monaco, model, position) {
    const context = contextProvider(model) || {};
    const project = context.project;
    const fullBefore = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
    const lineBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const lexical = inStringOrComment(fullBefore);
    const rangeFor = length => new monaco.Range(position.lineNumber, position.column - length, position.lineNumber, position.column);

    const envMatch = lineBefore.match(/\{\{\s*([\w.-]*)$/);
    if (envMatch) {
        const range = rangeFor(envMatch[1].length);
        return { suggestions: Object.entries(context.env || {}).map(([key, value]) => ({ label: { label: key, description: String(value).slice(0, 40) }, kind: monaco.languages.CompletionItemKind.Constant, insertText: key + '}}', range, sortText: key, detail: t('environmentVariable') })) };
    }
    if (lexical.state === 'line' || lexical.state === 'block') return { suggestions: [] };
    const entry = project ? await ensureIndex(project) : projectEntry('');
    if (lexical.state === 'string') {
        if (!project || lexical.quote === '`') return { suggestions: [] };
        const word = lineBefore.match(/([A-Za-z0-9_.]*)$/)[1];
        const items = await stringArgumentItems(monaco, project, entry, model, fullBefore, rangeFor(word.length));
        return { suggestions: items || [] };
    }

    const member = fullBefore.match(/(\??->|::)\s*([A-Za-z_]\w*)?$/);
    if (member) {
        const prefix = member[2] || '';
        const range = rangeFor(prefix.length);
        if (!project) return { suggestions: [] };
        const left = fullBefore.slice(0, fullBefore.length - member[0].length);
        const chain = extractChain(left);
        if (!chain) return { suggestions: [] };
        const type = await inferExpression(project, entry, chain, left.slice(0, left.length - chain.length));
        if (!type) return { suggestions: [] };
        const op = member[1] === '::' ? '::' : '->';
        const resolved = op === '::' ? { ...type, static: true } : type;
        return { suggestions: await memberItems(monaco, project, entry, resolved, op, range) };
    }

    const variable = lineBefore.match(/\$([A-Za-z_]\w*)?$/);
    if (variable) return { suggestions: variableItems(monaco, model, position, rangeFor(variable[0].length), context) };

    const useLine = lineBefore.match(/^\s*use\s+(\\?[A-Za-z_\\][\w\\]*)?$/);
    if (useLine) {
        const prefix = useLine[1] || '';
        return { suggestions: project ? classItems(monaco, entry, model, prefix, rangeFor(prefix.length), { inUse: true }) : [], incomplete: true };
    }

    const ident = lineBefore.match(/(\\?[A-Za-z_][\w\\]*)$/);
    if (!ident) return { suggestions: [] };
    const prefix = ident[1];
    const range = rangeFor(prefix.length);
    const afterNew = /\bnew\s+$/.test(lineBefore.slice(0, lineBefore.length - prefix.length));
    if (prefix.includes('\\')) return { suggestions: project ? classItems(monaco, entry, model, prefix, range, { qualified: true }) : [], incomplete: true };
    const suggestions = project ? classItems(monaco, entry, model, prefix, range) : [];
    if (!afterNew) suggestions.push(...globalItems(monaco, model, prefix, range, context));
    return { suggestions, incomplete: true };
}

function findCall(text) {
    let depth = 0;
    let commas = 0;
    for (let i = text.length - 1; i >= 0; i--) {
        const c = text[i];
        if (c === '"' || c === "'") {
            i = skipStringBack(text, i) + 1;
            continue;
        }
        if (c === ')' || c === ']' || c === '}') depth++;
        else if (c === '[' || c === '{') {
            if (depth === 0) return null;
            depth--;
        } else if (c === '(') {
            if (depth === 0) return { open: i, commas };
            depth--;
        } else if (c === ',' && depth === 0) commas++;
        else if (c === ';' && depth === 0) return null;
    }
    return null;
}

async function resolveCallee(project, entry, before) {
    const nameMatch = before.match(/(\\?[A-Za-z_][\w\\]*)\s*$/);
    if (!nameMatch) return null;
    const name = nameMatch[1];
    const head = before.slice(0, before.length - nameMatch[0].length);
    const op = head.match(/(\??->|::)\s*$/);
    if (op) {
        const left = head.slice(0, head.length - op[0].length);
        const chain = extractChain(left);
        let type = await inferExpression(project, entry, chain, left.slice(0, left.length - chain.length));
        if (!type) return null;
        const isStatic = op[1] === '::';
        if (isStatic && !type.static) type = { ...type, static: true };
        let methods = [];
        if (isStatic) {
            const { detail, methods: list } = await membersOf(project, type.cls);
            methods = list;
            if (detail?.isModel) methods = [...methods, ...(await membersOf(project, EB)).methods];
        } else if (isBuilder(type.cls)) {
            methods = [...(await membersOf(project, type.cls)).methods, ...(await membersOf(project, EB)).methods];
        } else {
            methods = (await membersOf(project, type.cls)).methods;
        }
        const method = methods.find(m => m.name.toLowerCase() === name.toLowerCase());
        return method ? { ...method, ownerName: type.cls } : null;
    }
    if (/\bnew\s+$/.test(head)) {
        const cls = resolveClassName(entry, name, before);
        const { methods } = await membersOf(project, cls);
        const ctor = methods.find(m => m.name === '__construct');
        return ctor ? { ...ctor, name: shortClass(cls), ownerName: cls } : null;
    }
    return helperMap.get(name.replace(/^\\/, '').toLowerCase()) || null;
}

async function provideSignature(monaco, model, position) {
    const context = contextProvider(model) || {};
    const text = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
    const call = findCall(text);
    if (!call) return null;
    const entry = context.project ? await ensureIndex(context.project) : projectEntry('');
    const method = await resolveCallee(context.project, entry, text.slice(0, call.open));
    if (!method) return null;
    const params = splitParams(method.params);
    const label = `${method.name}(${params.join(', ')})${method.returns ? ': ' + shortClass(method.returns) : ''}`;
    const parameters = [];
    let cursor = method.name.length + 1;
    for (const param of params) {
        parameters.push({ label: [cursor, cursor + param.length] });
        cursor += param.length + 2;
    }
    const variadic = params.length && /\.\.\./.test(params[params.length - 1]);
    const active = variadic ? Math.min(call.commas, params.length - 1) : call.commas;
    return {
        value: { signatures: [{ label, documentation: { value: method.doc || '' }, parameters }], activeSignature: 0, activeParameter: active },
        dispose() {}
    };
}

async function provideHover(monaco, model, position) {
    const context = contextProvider(model) || {};
    const line = model.getLineContent(position.lineNumber);
    const envRe = /\{\{\s*([\w.-]+)\s*\}\}/g;
    let em;
    while ((em = envRe.exec(line))) {
        if (position.column - 1 >= em.index && position.column - 1 <= em.index + em[0].length) {
            const value = context.env?.[em[1]];
            return { range: new monaco.Range(position.lineNumber, em.index + 1, position.lineNumber, em.index + em[0].length + 1), contents: [{ value: value === undefined ? `**${em[1]}** — ${t('unresolvedVariable')}` : `**${em[1]}** = \`${String(value).replace(/`/g, '\\`')}\`` }] };
        }
    }
    const word = model.getWordAtPosition(position);
    if (!word || !context.project) return null;
    const entry = await ensureIndex(context.project);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const before = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: word.startColumn });
    const after = line.slice(word.endColumn - 1);
    const name = word.word.replace(/^\$/, '');
    if (word.word.startsWith('$')) {
        const type = await inferVariable(context.project, entry, name, before, 0);
        return { range, contents: [{ value: '```php\n' + (type ? shortClass(type.cls) + (type.gen ? `<${shortClass(type.gen)}>` : '') + ' ' : 'mixed ') + word.word + '\n```' + (type ? `\n\n\`${type.cls}\`` : '') }] };
    }
    const op = before.match(/(\??->|::)\s*$/);
    if (op) {
        const left = before.slice(0, before.length - op[0].length);
        const chain = extractChain(left);
        let type = await inferExpression(context.project, entry, chain, left.slice(0, left.length - chain.length));
        if (!type) return null;
        if (op[1] === '::') type = { ...type, static: true };
        const detail = await classDetails(context.project, isBuilder(type.cls) ? EB : type.cls);
        if (detail?.isModel && !/^\s*\(/.test(after)) {
            const rel = detail.relations.find(r => r.name === name);
            if (rel) return { range, contents: [{ value: `\`\`\`php\n${rel.many ? `Collection<${shortClass(rel.related)}>` : shortClass(rel.related)} $${name}\n\`\`\`\n\n**${rel.type}** → \`${rel.related || '?'}\`` }] };
            if (detail.attributes.includes(name)) return { range, contents: [{ value: `\`\`\`php\n${shortClass(detail.name)}::$${name}\n\`\`\`\n\n${detail.fillable.includes(name) ? 'fillable' : t('attribute')}` }] };
        }
        const method = await resolveCallee(context.project, entry, before + word.word);
        if (method) return { range, contents: [{ value: methodDoc(method, method.ownerName) }] };
        return null;
    }
    if (/^\s*\(/.test(after) && !/\bnew\s+$/.test(before)) {
        const fn = helperMap.get(name.toLowerCase());
        if (fn) return { range, contents: [{ value: methodDoc(fn) }] };
    }
    const qualified = (before.match(/(\\?[A-Za-z_][\w\\]*\\)$/) || [''])[0] + word.word;
    const cls = resolveClassName(entry, qualified, model.getValue());
    if (!cls || !entry.classes.has(cls.toLowerCase())) return null;
    const detail = await classDetails(context.project, cls);
    if (!detail) return null;
    const kind = detail.isModel ? 'class' : detail.kind;
    const parents = detail.parents?.length ? ` extends ${shortClass(detail.parents[0])}` : '';
    const lines = ['```php', `${kind} ${detail.name}${parents}`, '```'];
    if (detail.doc) lines.push(detail.doc);
    if (detail.isModel) lines.push(`Eloquent model · ${detail.attributes.length} ${t('attributes')} · ${detail.relations.length} ${t('relations')}`);
    lines.push(`\`${detail.file}\``);
    return { range, contents: [{ value: lines.join('\n\n') }] };
}

export function registerIntellisense(monaco) {
    monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
        triggerCharacters: ['>', ':', '\\', '$', "'", '"', '{'],
        provideCompletionItems: (model, position) => provideCompletion(monaco, model, position).catch(error => {
            console.error(error);
            return { suggestions: [] };
        })
    });
    monaco.languages.registerSignatureHelpProvider(LANGUAGE_ID, {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp: (model, position) => provideSignature(monaco, model, position).catch(() => null)
    });
    monaco.languages.registerHoverProvider(LANGUAGE_ID, {
        provideHover: (model, position) => provideHover(monaco, model, position).catch(() => null)
    });
}
