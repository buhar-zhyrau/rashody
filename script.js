'use strict';

(() => {
  const storageKey = 'rashody.v1';
  const defaults = ['Еда', 'Транспорт', 'Дом'];
  const $ = (id) => document.getElementById(id);
  let state = { categories: [...defaults], expenses: [], budgets: [] };
  let storageReadable = true;
  let budgetView = '';
  let activeMonth = '';
  const money = (cents) => `${cents < 0 ? '−' : ''}${Math.floor(Math.abs(cents) / 100).toLocaleString('ru-RU')},${String(Math.abs(cents) % 100).padStart(2, '0')}`;
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = () => dateKey(new Date());
  const validDate = (value) => {
    if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value;
  };
  const categoryKey = (name) => name.trim().toLocaleLowerCase('ru-RU');
  const sum = (items) => items.reduce((total, item) => total + item.cents, 0);
  const storageError = (message) => { $('storage-message').textContent = message; $('storage-message').hidden = false; };

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      const data = JSON.parse(saved);
      if (!data || !Array.isArray(data.categories) || !Array.isArray(data.expenses) ||
          !data.categories.every((name) => typeof name === 'string' && name.trim()) ||
          !data.expenses.every((item) => item && Number.isSafeInteger(item.cents) && item.cents > 0 &&
            typeof item.category === 'string' && item.category.trim() && validDate(item.date) && typeof item.comment === 'string') ||
          !Number.isSafeInteger(sum(data.expenses))) throw new Error('Invalid data');
      const budgets = data.budgets === undefined ? [] : data.budgets;
      if (!Array.isArray(budgets)) throw new Error('Invalid budgets');
      const budgetPairs = new Set();
      const monthTotals = new Map();
      for (const item of budgets) {
        if (!item || typeof item.month !== 'string' || !validDate(`${item.month}-01`) ||
            typeof item.category !== 'string' || !item.category.trim() ||
            !Number.isSafeInteger(item.cents) || item.cents < 0) throw new Error('Invalid budget');
        const pair = JSON.stringify([item.month, categoryKey(item.category)]);
        const total = (monthTotals.get(item.month) || 0) + item.cents;
        if (budgetPairs.has(pair) || !Number.isSafeInteger(total)) throw new Error('Invalid budget total');
        budgetPairs.add(pair);
        monthTotals.set(item.month, total);
      }
      state = { categories: [...new Map([...defaults, ...data.categories, ...data.expenses.map((item) => item.category), ...budgets.map((item) => item.category)].map((name) => [categoryKey(name), name.trim()])).values()], expenses: data.expenses, budgets };
    }
  } catch {
    storageReadable = false;
    storageError('Не удалось прочитать сохранённые данные. Записи не будут перезаписаны. Проверьте доступ к хранилищу браузера.');
    $('expense-form').querySelector('button[type="submit"]').disabled = true;
    $('category-toggle').disabled = true;
  }

  function save(next) {
    if (!storageReadable) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      state = next;
      $('storage-message').hidden = true;
      return true;
    } catch {
      storageError('Не удалось сохранить данные. Проверьте свободное место и доступ к хранилищу браузера. Введённые значения оставлены в форме.');
      return false;
    }
  }

  function renderCategories(selected = $('category').value) {
    $('category').replaceChildren(...state.categories.map((name) => new Option(name, name)));
    if (state.categories.includes(selected)) $('category').value = selected;
    renderBudgets();
  }

  function renderBudgets() {
    const now = new Date();
    const month = dateKey(now).slice(0, 7);
    const view = JSON.stringify([month, state.categories]);
    if (view === budgetView) return;
    // Keep unfinished input when a new category is added in the same month.
    const drafts = new Map();
    if ($('budget-categories').dataset.month === month) {
      for (const input of $('budget-categories').querySelectorAll('input')) drafts.set(input.dataset.category, input.value);
    }
    budgetView = view;
    $('budget-categories').dataset.month = month;
    $('budget-month').textContent = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    $('budget-status').textContent = '';
    $('budget-categories').replaceChildren(...state.categories.map((name, index) => {
      const key = categoryKey(name);
      const saved = state.budgets.find((item) => item.month === month && categoryKey(item.category) === key);
      const form = document.createElement('form');
      form.className = 'budget-row';
      form.noValidate = true;
      const title = document.createElement('h3');
      title.textContent = name;
      const summary = document.createElement('p');
      summary.className = 'budget-saved';
      const showSaved = () => {
        const item = state.budgets.find((entry) => entry.month === month && categoryKey(entry.category) === key);
        summary.textContent = item ? `Лимит: ${money(item.cents)}` : 'Лимит: Не задан';
      };
      showSaved();
      const controls = document.createElement('div');
      controls.className = 'budget-controls';
      const label = document.createElement('label');
      label.textContent = 'Лимит на месяц';
      const input = document.createElement('input');
      input.inputMode = 'decimal';
      input.placeholder = 'Не задан';
      input.dataset.category = key;
      input.value = drafts.has(key) ? drafts.get(key) : saved ? money(saved.cents).replace(/\s/g, '') : '';
      const error = document.createElement('p');
      error.className = 'error';
      error.id = `budget-error-${index}`;
      error.setAttribute('role', 'alert');
      input.setAttribute('aria-describedby', `budget-help ${error.id}`);
      input.setAttribute('aria-label', `Лимит на месяц: ${name}`);
      const button = document.createElement('button');
      button.type = 'submit';
      button.textContent = 'Сохранить';
      button.setAttribute('aria-label', `Сохранить лимит: ${name}`);
      input.disabled = button.disabled = !storageReadable;
      label.append(input);
      controls.append(label, button);
      form.append(title, summary, controls, error);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        $('budget-status').textContent = '';
        if (today().slice(0, 7) !== month) {
          render();
          $('budget-status').textContent = 'Месяц изменился. Задайте лимит для нового месяца.';
          return;
        }
        error.textContent = '';
        input.removeAttribute('aria-invalid');
        const invalid = (message) => {
          error.textContent = message;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
        };
        const raw = input.value.trim();
        if (raw && !/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return invalid('Введите сумму от нуля, не более двух знаков после запятой.');
        const [whole, fraction = ''] = raw.replace(',', '.').split('.');
        const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        const budgets = state.budgets.filter((item) => item.month !== month || categoryKey(item.category) !== key);
        const total = budgets.filter((item) => item.month === month).reduce((value, item) => value + item.cents, 0) + cents;
        if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(total)) return invalid('Уменьшите слишком большую сумму.');
        if (raw) budgets.push({ month, category: name, cents });
        if (!save({ ...state, budgets })) return;
        input.value = raw ? money(cents).replace(/\s/g, '') : '';
        showSaved();
        $('budget-status').textContent = raw ? `Лимит сохранён: ${name}.` : `Лимит снят: ${name}.`;
      });
      return form;
    }));
  }

  function render() {
    renderBudgets();
    const now = new Date();
    activeMonth = dateKey(now).slice(0, 7);
    $('month-name').textContent = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    $('month-total').textContent = money(sum(state.expenses.filter((item) => item.date.startsWith(activeMonth))));
    const from = $('from-date').value;
    const to = $('to-date').value;
    const invalid = (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to);
    $('period-error').textContent = invalid ? 'Проверьте период: дата начала должна быть не позже даты окончания.' : '';
    const filtered = invalid ? [] : state.expenses.map((item, index) => ({ ...item, index }))
      .filter((item) => (!from || item.date >= from) && (!to || item.date <= to))
      .sort((a, b) => b.date.localeCompare(a.date) || b.index - a.index);
    $('period-total').hidden = invalid || (!from && !to);
    $('period-total').textContent = `Итого за период: ${money(sum(filtered))}`;
    $('empty').hidden = invalid || filtered.length > 0;
    $('empty').textContent = state.expenses.length ? 'За этот период трат нет' : 'Пока нет трат';
    $('expenses').replaceChildren(...filtered.map((item) => {
      const li = document.createElement('li');
      const top = document.createElement('div');
      top.className = 'expense-top';
      const category = document.createElement('span');
      category.className = 'expense-category';
      category.textContent = item.category;
      const amount = document.createElement('strong');
      amount.textContent = money(item.cents);
      top.append(category, amount);
      const date = document.createElement('time');
      date.className = 'expense-date';
      date.dateTime = item.date;
      date.textContent = item.date.split('-').reverse().join('.');
      li.append(top, date);
      if (item.comment) {
        const comment = document.createElement('p');
        comment.className = 'expense-comment';
        comment.textContent = item.comment;
        li.append(comment);
      }
      return li;
    }));
  }

  function formError(message, field) {
    $('form-error').textContent = message;
    $(field).setAttribute('aria-invalid', 'true');
    $(field).focus();
  }

  $('expense-form').addEventListener('submit', (event) => {
    event.preventDefault();
    $('form-error').textContent = '';
    $('status').textContent = '';
    ['amount', 'category', 'date'].forEach((id) => $(id).removeAttribute('aria-invalid'));
    const raw = $('amount').value.trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return formError('Введите сумму больше нуля, не более двух знаков после запятой.', 'amount');
    const [whole, fraction = ''] = raw.replace(',', '.').split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(sum(state.expenses) + cents)) return formError('Введите сумму больше нуля или уменьшите слишком большую сумму.', 'amount');
    const category = $('category').value;
    if (!state.categories.includes(category)) return formError('Выберите категорию.', 'category');
    const date = $('date').value;
    if (!validDate(date)) return formError('Укажите корректную дату.', 'date');
    const expense = { cents, category, date, comment: $('comment').value.trim() };
    if (!save({ ...state, expenses: [...state.expenses, expense] })) return;
    $('amount').value = '';
    $('comment').value = '';
    render();
    $('status').textContent = 'Трата добавлена.';
    $('amount').focus();
  });

  $('category-toggle').addEventListener('click', () => {
    const open = $('category-form').hidden;
    $('category-form').hidden = !open;
    $('category-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('category-name').focus();
  });
  $('category-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('category-name').value.trim();
    $('category-error').textContent = '';
    if (!name) { $('category-error').textContent = 'Введите название категории.'; $('category-name').focus(); return; }
    if (state.categories.some((existing) => categoryKey(existing) === categoryKey(name))) {
      $('category-error').textContent = 'Такая категория уже есть. Выберите её в списке.';
      $('category-name').focus();
      return;
    }
    if (!save({ ...state, categories: [...state.categories, name] })) return;
    renderCategories(name);
    $('category-name').value = '';
    $('category-form').hidden = true;
    $('category-toggle').setAttribute('aria-expanded', 'false');
    $('status').textContent = 'Категория добавлена и выбрана.';
    $('category').focus();
  });

  const presetButtons = [...document.querySelectorAll('[data-period]')];
  presetButtons.forEach((button) => button.addEventListener('click', () => {
    const period = button.dataset.period;
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (period === 'month') start.setDate(1);
    else if (period !== 'all') start.setDate(start.getDate() - Number(period) + 1);
    $('from-date').value = period === 'all' ? '' : dateKey(start);
    $('to-date').value = period === 'all' ? '' : dateKey(end);
    presetButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  ['from-date', 'to-date'].forEach((id) => $(id).addEventListener('input', () => {
    presetButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
    render();
  }));
  window.addEventListener('focus', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  setInterval(() => { if (today().slice(0, 7) !== activeMonth) render(); }, 60000);
  $('date').value = today();
  renderCategories();
  render();
})();
