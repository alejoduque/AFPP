/**
 * A row of big checkboxes (chips), finger-sized: the take's metadata and the
 * Layers window, so nothing has to be typed on a phone. Real <input
 * type=checkbox> (or radio) inside each label, so keyboards and screen readers
 * get the usual control.
 */
import React from 'react';

export default function Checks({ legend, options, value, onChange, radio = false, name }) {
  const on = (v) => (radio ? value === v : value.includes(v));
  const toggle = (v) => {
    if (radio) return onChange(v);
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <fieldset className="afpp-checks">
      {legend && <legend>{legend}</legend>}
      {options.map(([v, label]) => (
        <label key={v} className={on(v) ? 'is-on' : ''}>
          <input type={radio ? 'radio' : 'checkbox'} name={name} checked={on(v)} onChange={() => toggle(v)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
