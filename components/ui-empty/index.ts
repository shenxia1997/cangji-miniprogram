Component({
  properties: {
    icon: { type: String, value: '📄' },
    title: { type: String, value: '还没有记录' },
    desc: { type: String, value: '' },
    action: { type: String, value: '' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
