var ActualWorkspaceGuard = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <stdin>
  var stdin_exports = {};
  __export(stdin_exports, {
    commitWorkspaceNavigation: () => commitWorkspaceNavigation,
    installWorkspaceExitGuard: () => installWorkspaceExitGuard,
    sameWorkspaceActivity: () => sameWorkspaceActivity
  });
  var stateKey = "__studyWorkspaceHistoryIndex";
  var commitEvent = "studyagent:workspace-navigation-commit";
  function commitWorkspaceNavigation(href, commit) {
    const request = new CustomEvent(commitEvent, { cancelable: true, detail: { href, commit } });
    if (window.dispatchEvent(request)) commit();
  }
  var identityKeys = ["student", "studentId", "subject", "courseScope", "audience", "studioCourseId", "sourceCourseId", "lesson", "session", "project", "whiteboard", "draft", "course", "task", "reviewTask", "level", "track", "assistantAssignment", "assistantPractice", "teachingAssignment", "teachingSession", "teachingPractice", "capture"];
  function sameWorkspaceActivity(destination, current) {
    try {
      const next = new URL(destination, current), previous = new URL(current);
      return next.origin === previous.origin && next.pathname === previous.pathname && identityKeys.every((key) => JSON.stringify(next.searchParams.getAll(key)) === JSON.stringify(previous.searchParams.getAll(key)));
    } catch {
      return false;
    }
  }
  function installWorkspaceExitGuard(active, options = {}) {
    const history = window.history;
    let push = history.pushState, replace = history.replaceState;
    const index = () => {
      const value = history.state?.[stateKey];
      return Number.isSafeInteger(value) ? value : null;
    };
    const stamp = (data, value) => ({ ...data && typeof data === "object" ? data : {}, [stateKey]: value });
    if (index() === null) replace.call(history, stamp(history.state, 0), "", window.location.href);
    const position = () => ({ href: window.location.href, state: history.state, index: index() });
    let current = position(), bypass = "", restoring = null;
    function guardedWrite(data, unused, url, replacing) {
      const destination = new URL(url ?? window.location.href, window.location.href).href;
      const guard = destination !== window.location.href && bypass !== destination ? leaving(destination) : null;
      if (guard) {
        request(guard, destination, () => guardedWrite(data, unused, url, replacing));
        return;
      }
      if (bypass === destination) bypass = "";
      if (replacing) replace.call(history, stamp(data, index() ?? current.index ?? 0), unused, url);
      else push.call(history, stamp(data, (index() ?? current.index ?? 0) + 1), unused, url);
      if (!restoring) current = position();
    }
    const wrappedPush = function(data, unused, url) {
      guardedWrite(data, unused, url, false);
    };
    const wrappedReplace = function(data, unused, url) {
      guardedWrite(data, unused, url, true);
    };
    function patchHistory() {
      if (history.pushState === wrappedPush && history.replaceState === wrappedReplace) return;
      push = history.pushState;
      replace = history.replaceState;
      if (index() === null) replace.call(history, stamp(history.state, current.index ?? 0), "", window.location.href);
      current = position();
      history.pushState = wrappedPush;
      history.replaceState = wrappedReplace;
    }
    if (!options.deferHistoryPatch) patchHistory();
    function leaving(destination) {
      const guard = active();
      return guard && !(guard.isInternal ?? sameWorkspaceActivity)(destination, current.href) ? guard : null;
    }
    function request(guard, destination, resume, kind) {
      if (active()?.token !== guard.token) return;
      window.dispatchEvent(new Event("studyagent:close-navigation"));
      guard.request(destination, () => {
        if (active()?.token !== guard.token) return;
        bypass = destination;
        if (resume) resume();
        else window.location.assign(destination);
      }, kind);
    }
    const navigation = window.navigation;
    function traverse(event) {
      const change = event;
      if (change.navigationType !== "traverse" || !change.cancelable || !change.destination) return;
      if (bypass === change.destination.url) return;
      const guard = leaving(change.destination.url);
      if (!guard) return;
      const key = change.destination.key, destination = change.destination.url;
      const fromIndex = navigation?.currentEntry?.index, toIndex = change.destination.index;
      const delta = Number.isSafeInteger(fromIndex) && Number.isSafeInteger(toIndex) ? toIndex - fromIndex : 0;
      const native = () => {
        if (active()?.token !== guard.token) {
          bypass = "";
          return;
        }
        bypass = destination;
        try {
          const transition = delta === -1 ? navigation?.back?.() : delta === 1 ? navigation?.forward?.() : void 0;
          if (transition) {
            void Promise.all([transition.finished, transition.committed]).catch(() => {
              if (active()?.token === guard.token) window.location.assign(destination);
            });
            return;
          }
        } catch {
        }
        if (delta && Number.isSafeInteger(delta)) history.go(delta);
        else window.location.assign(destination);
      };
      const resume = key && navigation?.traverseTo ? () => {
        try {
          const transition = navigation.traverseTo(key);
          void Promise.all([transition.finished, transition.committed]).catch(native);
        } catch {
          native();
        }
      } : native;
      let returned = false, permitted = false;
      try {
        request(guard, destination, () => {
          if (!returned) permitted = true;
          else resume();
        });
      } catch (error) {
        change.preventDefault();
        change.stopImmediatePropagation();
        throw error;
      }
      returned = true;
      if (!permitted) {
        change.preventDefault();
        change.stopImmediatePropagation();
      }
    }
    function click(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self") return;
      const guard = leaving(anchor.href);
      if (!guard) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      request(guard, anchor.href);
    }
    function pop(event) {
      const next = position();
      if (restoring) {
        if (next.href === restoring.original.href) {
          event.stopImmediatePropagation();
          const pending = restoring;
          restoring = null;
          current = next;
          request(pending.guard, pending.destination.href, () => history.go(pending.destination.index - pending.original.index));
        }
        return;
      }
      if (bypass === next.href) {
        bypass = "";
        current = next;
        return;
      }
      const guard = leaving(next.href);
      if (!guard) {
        current = next;
        return;
      }
      event.stopImmediatePropagation();
      if (current.index !== null && next.index !== null && current.index !== next.index) {
        restoring = { original: current, destination: next, guard };
        history.go(current.index - next.index);
      } else {
        const previous = current;
        push.call(history, previous.state, "", previous.href);
        current = position();
        request(guard, next.href);
      }
    }
    function coordinated(event) {
      if (event.defaultPrevented) return;
      const value = event.detail;
      if (!value || typeof value.href !== "string" || typeof value.commit !== "function") return;
      const destination = new URL(value.href, window.location.href).href;
      event.preventDefault();
      const commit = () => {
        try {
          value.commit();
        } finally {
          if (bypass === destination) bypass = "";
        }
      }, guard = leaving(destination);
      if (guard) request(guard, destination, commit, "commit");
      else commit();
    }
    window.addEventListener(commitEvent, coordinated, true);
    navigation?.addEventListener("navigate", traverse);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    const dispose = () => {
      window.removeEventListener(commitEvent, coordinated, true);
      navigation?.removeEventListener("navigate", traverse);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
      if (history.pushState === wrappedPush) history.pushState = push;
      if (history.replaceState === wrappedReplace) history.replaceState = replace;
    };
    return Object.assign(dispose, { patchHistory });
  }
  return __toCommonJS(stdin_exports);
})();
