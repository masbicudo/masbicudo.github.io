function MDArray(items, shape, options) {
  /*
  items Array
    Elements that constitute the MDArray.
  shape Array of Int
    Indicates the length of each MDArray dimension.
  options Object
    autoreduce bool
      When a property is read, if all values are equal,
      return that value instead of another MDArray.
    funcBehavior String
      "get": get element, arguments are the coordinates
      "call": call inner functions, arguments are passed to inner functions
    funcProcessor (Function, Options) => Function
      Redefine function behaviour to accept MDArrays as arguments.
      Some possibilities are:
        - `null`: return original function
        - `MDArray.zipMinFunc`
        - `MDArray.zipMaxFunc`
        - `MDArray.mulFunc`
  */
  var undefined;
  items = Array.prototype.slice.call(items)
  options = options || MDArray.options || {}
  var isFunc = options.funcBehavior == "call"
            && items.every(function(x){return x instanceof Function});
  shape = Array.isArray(shape) ? shape : [shape === undefined ? items.length : shape];
  shape = shape.map(function(x){return parseInt(x)});
  if (!shape.every(function(x){return !isNaN(x)}))
    throw new Error("shape: lengths must be numbers.");
  var mods = shape.slice();
  for(var i = 0; i < mods.length-1; i++)
    mods[i+1] *= mods[i];
  if (mods.pop() != items.length)
    throw new Error("items, shape: product of all lengths must match elements in array.")
  mods.unshift(1);
  var calcIndex = function(a) {
    var s = 0;
    for(var i = 0; i < mods.length; i++) {
      if (a[i] > shape[i]) return -1;
      s += a[i]*mods[i];
    }
    return s;
  };
  var fn = isFunc ?
    function MDFnCaller() {
      // calling the MDArray as a function will call each inner function
      var a = arguments;
      return MDArray(items.map(function(x){return x.apply(this, a)}), shape, options)
    } :
    function MDItemGetter() {
      // calling the MDArray as a function returns the item at the specified location
      // e.g.:
      //    mda(1,2): returns the element at position (1, 2)
      if (arguments.length != shape.length) throw new Error("MDArray has " + shape.length + "dimensions.")
      var index = calcIndex(arguments);
      return items[index];
    };
  fn = isFunc && options.funcProcessor ? options.funcProcessor(fn, options) : fn;
  fn.__proto__ = MDArray.prototype;
  Object.defineProperty(fn, "__shape__", { get: function(){return shape} });
  Object.defineProperty(fn, "__items__", { get: function(){return items} });
  Object.defineProperty(fn, "__dims__", { get: function(){return shape.length} });
  Object.defineProperty(fn, "__size__", { get: function(){return items.length} });
  Object.defineProperty(fn, "__asarray__", { get: function(){
    var a = [];
    for(var d = 0; d < shape.length; d++)
      a.push([])
    for(var x = 0; x < items.length; x++) {
      a[0].push(items[x])
      for(var i = 0; i < shape.length; i++) {
        if (a[i].length < shape[i])
          break;
        if (!a[i+1])
          return a[i];
        a[i+1].push(a[i])
        a[i] = []
      }
    }
    return null;
  }});
  for (var i in items) {
    for(var k in items[i]) {
      if (!fn.hasOwnProperty(k)) {
        if (items[i].hasOwnProperty(k) && (!Array.isArray(items[i]) || isNaN(items[i]))) {
          function defineProperty(k) {
            Object.defineProperty(fn, k, {
              get: function() {
                if (options.autoreduce) {
                  var r0 = items[0][k];
                  if (items.every(function(x){return x[k]===r0 && !(x[k] instanceof Function)}))
                    return r0;
                }
                return MDArray(items.map(function(x){
                  return x[k] instanceof Function ? x[k].bind(x) : x[k]
                }), shape, options)
              },
              set: function(y) {
                if (y instanceof MDArray)
                  items.map(function(x,i){x[k] = y.__items__[i]})
                else
                  items.map(function(x){x[k] = y})
              }
            });
          }(k)
        }
      }
    }
  }
  fn = new Proxy(fn, {
    get: function(o, k) {
      if (k in o && o.hasOwnProperty(k)) return o[k];
      if (options.autoreduce) {
        var r0 = items[0][k];
        if (items.every(function(x){return x[k]===r0 && !(x[k] instanceof Function)}))
          return r0;
      }
      return MDArray(items.map(function(x){
        return x[k] instanceof Function ? x[k].bind(x) : x[k]
      }), shape, options)
    },
    set: function(o, k, y) {
      if (y instanceof MDArray)
        items.map(function(x,i){x[k] = y.__items__[i]})
      else
        items.map(function(x){x[k] = y})
    }
  })
  return fn;
}
MDArray.prototype.__proto__ = Array.prototype;
MDArray.zipMinFunc = function(fn, options) {
  return function MDZipMinFn() {
    var args = Array.prototype.slice.call(arguments)
    var mdargs = args.filter(function(x){return x instanceof MDArray});
    var cnt = mdargs.length
      ? Math.min.apply(null, mdargs.map(function(x){return x.__items__.length}))
      : 1;
    var items = []
    for(var i = 0; i < cnt; i++) {
      var subargs = args.map(function(x){
        return x instanceof MDArray ? x.__items__[i] : x
      });
      items.push(fn.apply(this, subargs))
    }
    return MDArray(items, [items.length], options)
  }
}
MDArray.zipMaxFunc = function(fn, options) {
  return function MDZipMaxFn() {
    var args = Array.prototype.slice.call(arguments)
    var mdargs = args.filter(function(x){return x instanceof MDArray});
    var cnt = mdargs.length
      ? Math.max.apply(null, mdargs.map(function(x){return x.__items__.length}))
      : 1;
    var items = []
    for(var i = 0; i < cnt; i++) {
      items.push(fn.apply(this, args.map(function(x){
        return x instanceof MDArray ? x.__items__[i] : x
      })))
    }
    return MDArray(items, [items.length], options)
  }
}
MDArray.mulFunc = function(fn, options) {
  return function MDAltMulFn() {
    var args = Array.prototype.slice.call(arguments)
    var cnt = args.map(function(x){return x instanceof MDArray ? x.__items__.length : 1})
    cnt.unshift(1)
    var i = 1;
    for(; i < cnt.length; i++)
      cnt[i] *= cnt[i - 1]
    var items = [], max = cnt[i - 1]
    for(var i = 0; i < max; i++) {
      var t = args.length;
      items.push(fn.apply(this, args.map(function(x,j){
        return x instanceof MDArray ? x.__items__[Math.floor((i%cnt[j+1])/cnt[j])] : x
      })))
    }
    var shape = args.filter(function(x){return x instanceof MDArray}).map(function(x){return x.__items__.length});
    return MDArray(items, shape, options)
  }
}
MDArray.func = MDArray.zipMinFunc
