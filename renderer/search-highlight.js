const SEARCHABLE_SELECTOR = '.message-content, .tool-name';

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unwrapMarks(root) {
  if (!root) return;
  for (const mark of root.querySelectorAll('mark.search-hit')) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  }
}

function highlightTextNode(textNode, query) {
  const text = textNode.textContent;
  if (!text || !query) return [];

  const regex = new RegExp(escapeRegExp(query), 'gi');
  const matches = [...text.matchAll(regex)];
  if (!matches.length) return [];

  const fragment = document.createDocumentFragment();
  let lastIndex = 0;

  for (const match of matches) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }
    const mark = document.createElement('mark');
    mark.className = 'search-hit';
    mark.textContent = text.slice(start, end);
    fragment.appendChild(mark);
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(fragment, textNode);
  return [...fragment.querySelectorAll('mark.search-hit')];
}

function expandCollapsedMatch(mark) {
  const toolBody = mark.closest('.tool-item-body');
  if (toolBody?.hidden) {
    toolBody.closest('.tool-item')
      ?.querySelector('[data-role="tool-expand-toggle"]')
      ?.click();
  }

  const content = mark.closest('.message-content');
  if (!content?.classList.contains('collapsed')) return;

  const wrapper = content.closest('.message-text-part');
  const expandBtn = wrapper?.querySelector('[data-role="expand-toggle"]');
  if (expandBtn) {
    expandBtn.click();
    return;
  }

  content.classList.remove('collapsed');
}

export function createSearchController(rootGetter, { searchableSelector } = {}) {
  const selector = searchableSelector || SEARCHABLE_SELECTOR;
  let activeIndex = -1;

  function getRoot() {
    return typeof rootGetter === 'function' ? rootGetter() : rootGetter;
  }

  function getMarks() {
    const root = getRoot();
    if (!root) return [];
    return [...root.querySelectorAll('mark.search-hit')];
  }

  function setActiveIndex(index) {
    const marks = getMarks();
    if (!marks.length) {
      activeIndex = -1;
      return { count: 0, index: -1 };
    }

    activeIndex = ((index % marks.length) + marks.length) % marks.length;
    marks.forEach((mark, i) => {
      mark.classList.toggle('active', i === activeIndex);
    });

    const activeMark = marks[activeIndex];
    expandCollapsedMatch(activeMark);
    activeMark.scrollIntoView({ block: 'center', behavior: 'smooth' });

    return { count: marks.length, index: activeIndex };
  }

  function clear() {
    unwrapMarks(getRoot());
    activeIndex = -1;
    return { count: 0, index: -1 };
  }

  function apply(query) {
    clear();
    const trimmed = query.trim();
    if (!trimmed) return { count: 0, index: -1 };

    const root = getRoot();
    if (!root) return { count: 0, index: -1 };

    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('mark.search-hit')) return NodeFilter.FILTER_REJECT;
        if (!parent.matches(selector)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const textNode of textNodes) {
      highlightTextNode(textNode, trimmed);
    }

    const marks = getMarks();
    if (!marks.length) {
      activeIndex = -1;
      return { count: 0, index: -1 };
    }

    return setActiveIndex(0);
  }

  function next() {
    const marks = getMarks();
    if (!marks.length) return { count: 0, index: -1 };
    return setActiveIndex(activeIndex + 1);
  }

  function prev() {
    const marks = getMarks();
    if (!marks.length) return { count: 0, index: -1 };
    return setActiveIndex(activeIndex - 1);
  }

  return { apply, clear, next, prev, getMarks };
}
