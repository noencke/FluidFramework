# Event API Improvements

## Non Breaking Changes

### Make `emit()` strongly typed

* Enables intellisense for event names which discourages typos
* Prevents incorrect arguments from being passed when emitting an event

### Create new format for declaring events

* Use a property map:
  ```typescript
  interface MyEvents {
    close: (error: boolean) => void;
  }
  ```
  rather than functions:
  ```typescript
  interface MyEvents {
    (event: "close", listener: (error: boolean) => void): void
  }
  ```
* This new format is just as expressive but is clearer and more succint.
* It's also easier to write type transformations of the new format.
* There is a type function which can transform the new format into the current format, so that the new format can be introduced alongside the current one.

## Breaking Changes

### Restrict `emit()` and `on()` to only allowing known event names (rather than any string)

* This prevents users from accidentally firing or listening to an event that doesn't exist.
  This might happen because of a typo when providing the event name, or because the event signature changed and the changer didn't find all the references to the event.

### Make `emit()` protected rather than public

* We have many classes that extend `EventEmitter` and call `emit()` privately; however they also expose `emit()` publically and that doesn't seem wise.
* We can also establish a canonical pattern for classes that want to emit events but don't want to extend `EventEmitter` (e.g. implement an interface and compose over a variant of an `EventEmitter` which _does_ have a public `emit()`)

### Stop using the nodejs event emitter class entirely

* We can write our own event emitter with a simpler interface (e.g. just `on()`) that is very little code and easily testable.
* This gets rid of clutter in the event interface. (Do we need `addListener()/removeListener()`? Does anyone ever use `prependListener()`?).
* Also gets rid of classes and types we wrote which are required to strongly type the untyped event emitter class

### Use "React-Style" event deregistration

* Calls to `on` return a function which when invoked, is equivalent to calling `off`.
* This can be a nice pattern because it removes the need for an `off` method on the event emitter interface.

### Allow event listeners to have return values

* Potentially a nice-to-have for some scenarios
* `emit()` would return an `Iterable` of listener return values
