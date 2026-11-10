// Сдвиг часов процесса для записи ролика: сервер «живёт» днём, когда идёт пара.
// Подключается через NODE_OPTIONS=--require, сдвиг в миллисекундах в TIME_SHIFT_MS.
const Real = Date;
const off = Number(process.env.TIME_SHIFT_MS || 0);
if (off) {
  globalThis.Date = new Proxy(Real, {
    construct(target, args, newTarget) {
      return args.length ? Reflect.construct(target, args, newTarget) : Reflect.construct(target, [Real.now() + off], newTarget);
    },
    apply() {
      return new Real(Real.now() + off).toString();
    },
    get(target, prop, receiver) {
      return prop === "now" ? () => Real.now() + off : Reflect.get(target, prop, receiver);
    },
  });
}
