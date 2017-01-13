function NDArray(items, shape, options) {
  var undefined;
  items = Array.prototype.slice.call(items)
  options = options || {}
  var isFunc = items.every(function(x){return x instanceof Function});
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
    function() {
      var a = arguments;
      return NDArray(items.map(function(x){return x.apply(this, a)}), shape, options)
    } :
    function() {
      if (arguments.length != shape.length) throw new Error("NDArray has " + shape.length + "dimensions.")
      var index = calcIndex(arguments);
      return items[index];
    };
  fn.__proto__ = NDArray.prototype;
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
                return NDArray(items.map(function(x){
                  return x[k] instanceof Function ? x[k].bind(x) : x[k]
                }), shape, options)
              },
              set: function(y) {
                if (y instanceof NDArray)
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
      return NDArray(items.map(function(x){
        return x[k] instanceof Function ? x[k].bind(x) : x[k]
      }), shape, options)
    },
    set: function(o, k, v) {
      if (y instanceof NDArray)
        items.map(function(x,i){x[k] = y.__items__[i]})
      else
        items.map(function(x){x[k] = y})
    }
  })
  return fn;
}
NDArray.prototype.__proto__ = Array.prototype;
NDArray.zipMinFunc = function(fn, options) {
  return function() {
    var args = Array.prototype.slice.call(arguments)
    var cnt = Math.min.apply(null, args
      .filter(function(x){return x instanceof NDArray})
      .map(function(x){return x.__items__.length}));
    var items = []
    for(var i = 0; i < cnt; i++) {
      items.push(fn.apply(this, args.map(function(x){
        return x instanceof NDArray ? x.__items__[i] : x
      })))
    }
    return NDArray(items, [items.length], options)
  }
}
NDArray.zipMaxFunc = function(fn, options) {
  return function() {
    var args = Array.prototype.slice.call(arguments)
    var cnt = Math.max.apply(null, args
      .filter(function(x){return x instanceof NDArray})
      .map(function(x){return x.__items__.length}));
    var items = []
    for(var i = 0; i < cnt; i++) {
      items.push(fn.apply(this, args.map(function(x){
        return x instanceof NDArray ? x.__items__[i] : x
      })))
    }
    return NDArray(items, [items.length], options)
  }
}
NDArray.mulFunc = function(fn, options) {
  return function() {
    var args = Array.prototype.slice.call(arguments)
    var cnt = args.map(function(x){return x instanceof NDArray ? x.__items__.length : 1})
    cnt.unshift(1)
    var i = 1;
    for(; i < cnt.length; i++)
      cnt[i] *= cnt[i - 1]
    var items = [], max = cnt[i - 1]
    for(var i = 0; i < max; i++) {
      var t = args.length;
      items.push(fn.apply(this, args.map(function(x,j){
        return x instanceof NDArray ? x.__items__[Math.floor((i%cnt[j+1])/cnt[j])] : x
      })))
    }
    var shape = args.filter(function(x){return x instanceof NDArray}).map(function(x){return x.__items__.length});
    return NDArray(items, shape, options)
  }
}
NDArray.func = NDArray.zipMinFunc
