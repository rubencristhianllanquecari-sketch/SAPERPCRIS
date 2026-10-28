(() => {
  const config = window.LLANQUE_SUPABASE_CONFIG;
  const clientFactory = window.supabase?.createClient;
  if (!config?.url || !config?.publishableKey || !clientFactory) {
    window.llanqueCloudError = 'No se pudo cargar la conexión con Supabase. Revisa internet y supabase-config.js.';
    return;
  }

  const client = clientFactory(config.url, config.publishableKey);
  const prefix = 'llanque-demo-';
  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  let syncing = false;
  let timer = 0;
  const pending = new Map();

  function status(message, failed = false) {
    const element = document.querySelector('#cloudStatus');
    if (element) {
      element.textContent = message;
      element.classList.toggle('cloud-error', failed);
    }
  }

  async function upload(key, rawValue) {
    let stateValue;
    try { stateValue = JSON.parse(rawValue); } catch { stateValue = rawValue; }
    const { error } = await client.from('llanque_app_state').upsert({
      state_key: key,
      state_value: stateValue,
      updated_at: new Date().toISOString()
    }, { onConflict: 'state_key' });
    if (error) throw error;
  }

  async function flush() {
    if (!pending.size) return true;
    const batch = [...pending.entries()];
    pending.clear();
    status('Guardando…');
    try {
      for (const [key, value] of batch) {
        if (value === null) {
          const { error } = await client.from('llanque_app_state').delete().eq('state_key', key);
          if (error) throw error;
        } else await upload(key, value);
      }
      status('Datos en la nube');
      return true;
    } catch (error) {
      for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
      status('Error al guardar', true);
      console.error('LLANQUE Supabase:', error.message);
      document.dispatchEvent(new CustomEvent('llanque-cloud-error', { detail: error.message }));
      return false;
    }
  }

  function queue(key, value) {
    pending.set(key, value);
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  Storage.prototype.setItem = function(key, value) {
    originalSet.call(this, key, value);
    if (this === localStorage && syncing && String(key).startsWith(prefix)) queue(String(key), String(value));
  };
  Storage.prototype.removeItem = function(key) {
    originalRemove.call(this, key);
    if (this === localStorage && syncing && String(key).startsWith(prefix)) {
      pending.set(String(key), null);
      clearTimeout(timer);
      timer = setTimeout(flushRemovals, 250);
    }
  };

  async function flushRemovals() {
    const batch = [...pending.entries()];
    pending.clear();
    status('Guardando…');
    try {
      for (const [key, value] of batch) {
        if (value === null) {
          const { error } = await client.from('llanque_app_state').delete().eq('state_key', key);
          if (error) throw error;
        } else await upload(key, value);
      }
      status('Datos en la nube');
    } catch (error) {
      for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
      status('Error al guardar', true);
      console.error('LLANQUE Supabase:', error.message);
      document.dispatchEvent(new CustomEvent('llanque-cloud-error', { detail: error.message }));
    }
  }

  async function load() {
    syncing = false;
    const { data, error } = await client.from('llanque_app_state').select('state_key,state_value');
    if (error) throw error;
    const remoteKeys = new Set((data || []).map(row => row.state_key));
    let stateKeys = [...remoteKeys];
    if (data?.length) {
      for (const row of data) originalSet.call(localStorage, row.state_key, JSON.stringify(row.state_value));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && !remoteKeys.has(key)) originalRemove.call(localStorage, key);
      }
      status('Datos cargados');
    } else {
      // First authenticated sign-in: retain and upload this browser's existing LLANQUE records.
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) { pending.set(key, localStorage.getItem(key)); stateKeys.push(key); }
      }
    }
    syncing = true;
    if (pending.size && !(await flush())) throw new Error('No se pudieron copiar los datos locales a Supabase. Revisa la tabla y sus políticas RLS.');
    return { hasRemoteData: Boolean(data?.length), stateKeys };
  }

  window.llanqueCloud = {
    client,
    load,
    flush,
    signOut: () => client.auth.signOut(),
    setStatus: status
  };
})();
