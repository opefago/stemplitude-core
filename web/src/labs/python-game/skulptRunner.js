import { getGameModuleSource } from './gameModule';

const SKULPT_CDN = 'https://skulpt.org/js/skulpt.min.js';
const SKULPT_STDLIB_CDN = 'https://skulpt.org/js/skulpt-stdlib.js';

let skulptLoaded = false;
let loadingPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function loadSkulpt() {
  if (skulptLoaded && window.Sk) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = loadScript(SKULPT_CDN)
    .then(() => loadScript(SKULPT_STDLIB_CDN))
    .then(() => {
      skulptLoaded = true;
    });

  return loadingPromise;
}

function friendlyError(msg) {
  let text = String(msg);
  if (text.includes('is not defined')) {
    text += '\nHint: Check your spelling — variable and function names are case-sensitive.';
  } else if (text.includes('IndentationError')) {
    text += '\nHint: Python uses spaces for indentation. Make sure lines inside if/def/for are indented.';
  } else if (text.includes('SyntaxError')) {
    text += '\nHint: Check for missing colons (:), parentheses, or quotes.';
  } else if (text.includes('TypeError')) {
    text += '\nHint: You might be using the wrong type — e.g. adding a string and a number.';
  }
  return text;
}

export function runPythonCode(code, engine, outputCallback, errorCallback) {
  const Sk = window.Sk;
  if (!Sk) {
    errorCallback('Python engine not loaded yet. Please wait and try again.');
    return;
  }

  Sk.gameEngine = engine;

  const gameModSource = getGameModuleSource();

  Sk.configure({
    output: function (text) {
      outputCallback(text);
    },
    read: function (filename) {
      if (filename === 'src/lib/game.js') {
        return gameModSource;
      }
      if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][filename] === undefined) {
        throw "File not found: '" + filename + "'";
      }
      return Sk.builtinFiles['files'][filename];
    },
    __future__: Sk.python3,
    execLimit: null,
    killableWhile: true,
    killableFor: true,
  });

  const promise = Sk.misceval.asyncToPromise(function () {
    return Sk.importMainWithBody('<stdin>', false, code, true);
  });

  promise.then(
    function () { /* success */ },
    function (err) {
      errorCallback(friendlyError(err));
    }
  );
}
