
function Mvvm(options = {}) {
  this.$el = options.el
  this.$data = options.data
  this.$options = options

  // 数据劫持: 监听属性的读写操作
  new Observer(this.$data)

  // 数据代理: vm.price -> vm.$data.price
  this.proxyData(this.$data)

  // 初始化 computed: 把 computed 属性挂载到 vm 实例上
  this.initComputed()

  // 模板编译: data -> view
  new Compiler(this.$el, this)
}


Mvvm.prototype = {
  // 数据代理, 把 data 中的属性直接挂载到 vm 实例上
  // 先劫持再代理
  proxyData(data){
    Object.keys(data).forEach(key => {
      Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true, 
        get() {
          return data[key]
        },
        set(newVal) {
          data[key] = newVal
        }
      })
    })
  },
  // 初始化属性表达式
  initComputed() {
    let computed = this.$options.computed || {}
    Object.keys(computed).forEach(key => {
      Object.defineProperty(this, key, {
        get: typeof computed[key] === 'function' ?  computed[key] : computed[key].get
      })
    })
  },
  // 根据表达式 info.title 获取到 data 中对应的属性值
  getData(exp) {
    let arr = exp.split('.') // ['info', 'title']
    return arr.reduce((acc,cur) => {
      return acc[cur.trim()] // this['info'][title]
    }, this)
  },
  // 根据表达式 info.title 设置 data 中对应的属性值
  setData(exp, newVal) {
    arr = exp.split('.') // ['info', 'title']
    return arr.reduce((acc,cur,idx)=>{
      if(idx === arr.length - 1){
          return acc[cur] = newVal  // vm['info'][title] = newVal
      }
      return acc[cur]
    },this)
  }
}

// 数据劫持
function Observer(data) {
  this.data = data
  this.observe(this.data)
}

Observer.prototype = {
  observe(data) {
    // 当 data 为 Object 类型时进行数据劫持
    if(typeof data !== 'object' || data === null) return

    // 遍历 data 对每个属性进行劫持, 如果属性也是一个 Object 类型就递归劫持
    Object.keys(data).forEach(key => {
      let temp = data[key]
      this.defineReactive(data, key, temp) // 属性劫持
      this.observe(temp) // 递归劫持
    })
  },
  defineReactive(obj, key, value) {
    let that = this
    // 为每个属性创建一个依赖中心, 收集依赖 watcher
    let dependence = new Dependence(key)
    Object.defineProperty(obj, key, { 
      enumerable: true,
      configurable: true, 
      get() {
        // console.log('数据劫持-getter:', key, value)
        Dependence.tag && dependence.addSub(Dependence.tag)
        return value 
      },
      set(newVal) {
        if (newVal === value) return
        // console.log('数据劫持-setter:', key, value)
        value = newVal
        that.observe(newVal) // 劫持新增属性

        // 属性值改变, 通知所有的 watcher 跟新模板
        dependence.notify()
      }
    })
  }
}

// 模板编译
function Compiler(el, vm) {1
  this.vm = vm
  // 获取 #app 元素
  this.el = document.querySelector(el)
  // 创建一个空的文档片段
  let fragment = document.createDocumentFragment()
  // 将 #app 中所有子元素读取到文档片段中
  let child = null
  while(child = this.el.firstChild) {
    fragment.appendChild(child)
  }
  // 替换: data.price -> {{ price }}
  this.replaceState(fragment)
  // 将替换后的文档片段插回 #app 元素子节点中
  this.el.appendChild(fragment)
}

Compiler.prototype = {
  replaceState(node) {
    Array.from(node.childNodes).forEach(node => {
      // nodeType: 1 元素节点, 2 属性节点, 3 文本节点
      // 如果是文本节点, 且包含 {{}}, 就进行替换操作 data.price -> {{ price }}3
      let text = node.textContent
      let reg = /\{\{(.*)\}\}/
      if(node.nodeType === 3 && reg.test(text)) {
        // 获取 {{}} 中的表达式: price, num, info.title
        let exp = RegExp.$1
        // 根据 exp 获取 data 中对应的属性值
        let val = this.vm.getData(exp)
        // 替换
        node.textContent = text.replace(reg, val)

        // 发布/订阅: { price }}, 创建 watcher 实例
        new Watcher(this.vm, exp, function(newVal) {
          node.textContent = text.replace(reg, newVal)
        })
      }
      // 如果是元素节点, 遍历所有的属性, 找到 v-model 属性, 一般用于表单控件
      // v-model="exp" , 将 exp 对应的 data 中的属性值赋给节点的 value 属性
      else if(node.nodeType === 1) {
        let attrs = node.attributes
        Array.from(attrs).forEach(attr => {
          let name = attr.name 
          let exp = attr.value 
          if(name === 'v-model') {
            node.value = this.vm.getData(exp)

            // 发布/订阅: v-model = "num", 创建 watcher 实例
            new Watcher(this.vm, exp, newVal => {
              node.value = newVal
            })

            // 监听控件的 input 事件, 将输入值更新给 data 中对应的属性
            node.addEventListener('input', e => {
              this.vm.setData(exp, e.target.value)
            })
          }
        })
      }
      // 如果当前节点还有子节点, 就进行递归替换
      if (node.childNodes) {
        this.replaceState(node) 
      }
    })
  }
}

// 依赖中心
function Dependence(key) {
  this.key = key
  this.subscribes = []
}

Dependence.prototype = {
  // 依赖收集
  addSub(sub) {
    this.subscribes.push(sub)
  },
  // 发布通知
  notify() {
    console.log(`发布消息: ${this.key}.dependence.notify`)

    this.subscribes.forEach(sub => sub.update())
  }
}

// 观察者
function Watcher(vm, exp, cb) {
  this.cb = cb
  this.vm = vm
  this.exp = exp

  // 触发 getter 方法, 收集依赖 watcher
  Dependence.tag = this 
  this.vm.getData(exp)
  Dependence.tag = null
}

Watcher.prototype = {
  // 更新模板
  update() {
    let val = this.vm.getData(this.exp)
    this.cb(val)
    console.log(`收到消息: ${this.exp.trim()}.watcher.update`, val)
  }
}