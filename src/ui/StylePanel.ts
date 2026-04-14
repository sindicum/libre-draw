import type { PartialStyleConfig } from '../types/style';
import { DEFAULT_STYLE_CONFIG } from '../types/style';

export interface StylePanelCallbacks {
  onStyleChange(style: PartialStyleConfig): void;
}

interface StyleField {
  label: string;
  type: 'color' | 'number';
  section: string;
  getValue: () => string;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Popup panel for editing global style settings.
 * Contains 17 configurable style properties organized in sections.
 */
export class StylePanel {
  private container: HTMLDivElement;
  private inputs: Map<string, HTMLInputElement> = new Map();
  private callbacks: StylePanelCallbacks;

  constructor(callbacks: StylePanelCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.className = 'libre-draw-style-panel';
    this.applyContainerStyles();

    const d = DEFAULT_STYLE_CONFIG;

    const sections: { title: string; fields: StyleField[] }[] = [
      {
        title: '地物スタイル',
        fields: [
          { label: 'ライン色', type: 'color', section: 'outline.color', getValue: () => d.outline.color },
          { label: 'ライン太さ', type: 'number', section: 'outline.width', getValue: () => String(d.outline.width), min: 1, max: 10, step: 1 },
          { label: 'ポリゴン色', type: 'color', section: 'fill.color', getValue: () => d.fill.color },
          { label: 'ポリゴン透明度', type: 'number', section: 'fill.opacity', getValue: () => String(d.fill.opacity), min: 0, max: 1, step: 0.1 },
          { label: '点の色', type: 'color', section: 'point.color', getValue: () => d.point.color },
          { label: '点の大きさ', type: 'number', section: 'point.radius', getValue: () => String(d.point.radius), min: 2, max: 20, step: 1 },
          { label: '点のhover色', type: 'color', section: 'point.hoverColor', getValue: () => d.point.hoverColor },
        ],
      },
      {
        title: '選択時スタイル',
        fields: [
          { label: '頂点の色', type: 'color', section: 'editVertex.color', getValue: () => d.editVertex.color },
          { label: '頂点の大きさ', type: 'number', section: 'editVertex.radius', getValue: () => String(d.editVertex.radius), min: 2, max: 20, step: 1 },
          { label: '中間点の色', type: 'color', section: 'midpoint.color', getValue: () => d.midpoint.color },
          { label: '中間点の大きさ', type: 'number', section: 'midpoint.radius', getValue: () => String(d.midpoint.radius), min: 2, max: 20, step: 1 },
          { label: 'hover色', type: 'color', section: 'editVertex.highlightedColor', getValue: () => d.editVertex.highlightedColor },
          { label: 'ライン色', type: 'color', section: 'outline.selectedColor', getValue: () => d.outline.selectedColor },
          { label: 'ポリゴン色', type: 'color', section: 'fill.selectedColor', getValue: () => d.fill.selectedColor },
          { label: 'ポリゴン透明度', type: 'number', section: 'fill.selectedOpacity', getValue: () => String(d.fill.selectedOpacity), min: 0, max: 1, step: 0.1 },
        ],
      },
      {
        title: 'ガイドライン',
        fields: [
          { label: '破線の色', type: 'color', section: 'preview.color', getValue: () => d.preview.color },
          { label: '破線の太さ', type: 'number', section: 'preview.width', getValue: () => String(d.preview.width), min: 1, max: 10, step: 1 },
        ],
      },
    ];

    for (const section of sections) {
      this.addSectionHeader(section.title);
      for (const field of section.fields) {
        const input = this.addField(field);
        this.inputs.set(field.section, input);
      }
    }

    this.setVisible(false);
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  setPosition(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.container.style.right = '100%';
      this.container.style.left = '';
      this.container.style.marginRight = '8px';
      this.container.style.marginLeft = '';
    } else {
      this.container.style.left = '100%';
      this.container.style.right = '';
      this.container.style.marginLeft = '8px';
      this.container.style.marginRight = '';
    }
  }

  destroy(): void {
    this.container.remove();
  }

  private collectStyle(): PartialStyleConfig {
    const get = (key: string): string =>
      this.inputs.get(key)?.value ?? '';
    const num = (key: string): number =>
      Number(this.inputs.get(key)?.value ?? 0);

    return {
      fill: {
        color: get('fill.color'),
        opacity: num('fill.opacity'),
        selectedColor: get('fill.selectedColor'),
        selectedOpacity: num('fill.selectedOpacity'),
      },
      outline: {
        color: get('outline.color'),
        width: num('outline.width'),
        selectedColor: get('outline.selectedColor'),
      },
      point: {
        color: get('point.color'),
        radius: num('point.radius'),
        hoverColor: get('point.hoverColor'),
      },
      editVertex: {
        color: get('editVertex.color'),
        radius: num('editVertex.radius'),
        highlightedColor: get('editVertex.highlightedColor'),
      },
      midpoint: {
        color: get('midpoint.color'),
        radius: num('midpoint.radius'),
      },
      preview: {
        color: get('preview.color'),
        width: num('preview.width'),
      },
    };
  }

  private handleInput = (): void => {
    this.callbacks.onStyleChange(this.collectStyle());
  };

  private addSectionHeader(title: string): void {
    const header = document.createElement('div');
    header.textContent = title;
    header.style.fontSize = '11px';
    header.style.fontWeight = 'bold';
    header.style.color = '#666';
    header.style.borderBottom = '1px solid #e0e0e0';
    header.style.paddingBottom = '2px';
    header.style.marginTop = '4px';
    this.container.appendChild(header);
  }

  private addField(field: StyleField): HTMLInputElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '6px';

    const label = document.createElement('label');
    label.textContent = field.label;
    label.style.fontSize = '11px';
    label.style.color = '#333';
    label.style.whiteSpace = 'nowrap';

    const input = document.createElement('input');
    input.setAttribute('aria-label', field.label);

    input.style.width = '48px';
    input.style.height = '24px';
    input.style.border = '1px solid #c8c8c8';
    input.style.borderRadius = '3px';
    input.style.boxSizing = 'border-box';

    if (field.type === 'color') {
      input.type = 'color';
      input.value = field.getValue();
      input.style.padding = '0';
      input.style.cursor = 'pointer';
    } else {
      input.type = 'number';
      input.value = field.getValue();
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      if (field.step !== undefined) input.step = String(field.step);
      input.style.padding = '0 4px';
      input.style.fontSize = '11px';
    }

    input.addEventListener('input', this.handleInput);

    row.appendChild(label);
    row.appendChild(input);
    this.container.appendChild(row);
    return input;
  }

  private applyContainerStyles(): void {
    const s = this.container.style;
    s.position = 'absolute';
    s.top = '0';
    s.display = 'flex';
    s.flexDirection = 'column';
    s.gap = '4px';
    s.padding = '8px';
    s.background = 'rgba(255, 255, 255, 0.97)';
    s.border = '1px solid #d0d7de';
    s.borderRadius = '4px';
    s.pointerEvents = 'auto';
    s.whiteSpace = 'nowrap';
    s.zIndex = '2';
    s.minWidth = '180px';
  }
}
