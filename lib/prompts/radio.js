/**
 * `list` type prompt
 */

import chalk from 'chalk';
import cliCursor from 'cli-cursor';
import figures from 'figures';
import { map, takeUntil } from 'rxjs';
import Base from './base.js';
import commonStrings from '../utils/commonStrings.js';
import observe from '../utils/events.js';
import Paginator from '../utils/paginator.js';
import incrementListIndex from '../utils/incrementListIndex.js';

export default class RadioPrompt extends Base {
  constructor(questions, rl, answers) {
    super(questions, rl, answers);

    if (!this.opt.choices) {
      this.throwParamError('choices');
    }

    if (Array.isArray(this.opt.default)) {
      this.opt.choices.forEach(function (choice) {
        if (this.opt.default.indexOf(choice.value) >= 0) {
          choice.checked = true;
        }
      }, this);
    }

    this.pointer = 0;
    this.selected = "";

    // Make sure no default is set (so it won't be printed)
    this.opt.default = null;

    const shouldLoop = this.opt.loop === undefined ? true : this.opt.loop;
    this.paginator = new Paginator(this.screen, { isInfinite: shouldLoop });
  }

  getPointed() {
    if(this.opt.choices.length > 0) {
      return this.opt.choices.getChoice(this.pointer).name;
    } else {
      return "";
    }
  }

  getSelected() {
    return this.selected;
  }

  removeAll() {
    this.opt.choices.choices.splice(0);
    this.opt.choices.realChoices.splice(0);
  }

  update(values, pointed, selected) {
    this.removeAll();
    values.forEach((v) => {
      this.opt.choices.push(v);
    });
    this.pointer = pointed
    if(selected != -1) {
      this.setChoice(selected);
    }
    this.render();
  }

  /**
   * Start the Inquiry session
   * @param  {Function} cb      Callback when prompt is done
   * @return {this}
   */

  _run(cb) {
    this.done = cb;

    const events = observe(this.rl);

    const validation = this.handleSubmitEvents(
      events.line.pipe(map(this.getCurrentValue.bind(this)))
    );
    validation.success.forEach(this.onEnd.bind(this));
    validation.error.forEach(this.onError.bind(this));

    events.normalizedUpKey
      .pipe(takeUntil(validation.success))
      .forEach(this.onUpKey.bind(this));
    events.normalizedDownKey
      .pipe(takeUntil(validation.success))
      .forEach(this.onDownKey.bind(this));
    events.spaceKey
      .pipe(takeUntil(validation.success))
      .forEach(this.onSpaceKey.bind(this));
    events.backspaceKey
      .pipe(takeUntil(validation.success))
      .forEach(this.onBackspaceKeyKey.bind(this));

    // Init the prompt
    cliCursor.hide();
    this.render();
    this.firstRender = false;

    return this;
  }

  onBackspaceKeyKey() {
    this.onEnd();
  }

  /**
   * Render the prompt to screen
   * @return {CheckboxPrompt} self
   */

  render(error) {
    // Render question
    let message = this.getQuestion();
    let bottomContent = '';

    if (!this.dontShowHints) {
      message +=
        '\n(Press ' +
        chalk.cyan.bold('<space>') +
        ' to select, ' +
        chalk.cyan.bold('<enter>') +
        ' to proceed, ' +
        chalk.cyan.bold('<backspace>') +
        ' to go back, or' +
        ' leave no selection and press ' +
        chalk.cyan.bold('<enter>') +
        ' to go back)';
    }

    // Render choices or answer depending on the state
    if (this.status === 'answered') {
      message += chalk.cyan(this.selection.join(', '));
    } else {
      const choicesStr = renderChoices(this.opt.choices, this.pointer);
      const indexPosition = this.opt.choices.indexOf(
        this.opt.choices.getChoice(this.pointer)
      );
      const realIndexPosition =
        this.opt.choices.reduce((acc, value, i) => {
          // Dont count lines past the choice we are looking at
          if (i > indexPosition) {
            return acc;
          }
          // Add line if it's a separator
          if (value.type === 'separator') {
            return acc + 1;
          }

          let l = value.name;
          // Non-strings take up one line
          if (typeof l !== 'string') {
            return acc + 1;
          }

          // Calculate lines taken up by string
          l = l.split('\n');
          return acc + l.length;
        }, 0) - 1;
      message +=
        '\n' + this.paginator.paginate(choicesStr, realIndexPosition, this.opt.pageSize);
    }

    if (error) {
      bottomContent = chalk.red('>> ') + error;
    }

    this.screen.render(message, bottomContent);
  }

  /**
   * When user press `enter` key
   */

  onEnd(state) {
    if(!state || this.selection.length == 0) {
      this.selection = [];
      state = {value: commonStrings.cancelString};
    }

    this.status = 'answered';
    this.dontShowHints = true;
    // Rerender prompt (and clean subline error)
    this.render();

    this.screen.done();
    cliCursor.show();
    this.done(state.value);
  }

  onError(state) {
    this.render(state.isValid);
  }

  getCurrentValue() {
    const choices = this.opt.choices.filter(
      (choice) => Boolean(choice.checked) && !choice.disabled
    );

    this.selection = choices.map((choice) => choice.short);
    return choices.map((choice) => choice.value);
  }

  onUpKey() {
    this.pointer = incrementListIndex(this.pointer, 'up', this.opt);
    this.render();
  }

  onDownKey() {
    this.pointer = incrementListIndex(this.pointer, 'down', this.opt);
    this.render();
  }

  onNumberKey(input) {
  }

  onSpaceKey() {
    this.clearAllChoices();
    this.setChoice(this.pointer);
    this.render();
  }

  onAllKey() {
  }

  onInverseKey() {
    this.opt.choices.forEach((choice) => {
      if (choice.type !== 'separator') {
        choice.checked = !choice.checked;
      }
    });

    this.render();
  }

  setChoice(index) {
    let item = this.opt.choices.getChoice(index);
    if (item !== undefined) {
      item.checked = true;
      this.selected = item.name;
    }
  }

  clearChoice(index) {
    let item = this.opt.choices.getChoice(index);
    if (item !== undefined) {
      item.checked = false;
      if(this.selected == item.name) {
        this.selected = "";
      }
    }
  }

  clearAllChoices() {
    for(let i = 0; i < this.opt.choices.realLength; i++) {
      this.clearChoice(i);
    }
    this.selected = "";
  }
}

/**
 * Function for rendering checkbox choices
 * @param  {Number} pointer Position of the pointer
 * @return {String}         Rendered content
 */

function renderChoices(choices, pointer) {
  let output = '';
  let separatorOffset = 0;

  choices.forEach((choice, i) => {
    if (choice.type === 'separator') {
      separatorOffset++;
      output += ' ' + choice + '\n';
      return;
    }

    if (choice.disabled) {
      separatorOffset++;
      output += ' - ' + choice.name;
      output += ` (${
        typeof choice.disabled === 'string' ? choice.disabled : 'Disabled'
      })`;
    } else {
      const line = getCheckbox(choice.checked) + ' ' + choice.name;
      if (i - separatorOffset === pointer) {
        output += chalk.cyan(figures.pointer + line);
      } else {
        output += ' ' + line;
      }
    }

    output += '\n';
  });

  return output.replace(/\n$/, '');
}

/**
 * Get the checkbox
 * @param  {Boolean} checked - add a X or not to the checkbox
 * @return {String} Composited checkbox string
 */

function getCheckbox(checked) {
  return checked ? chalk.green(figures.radioOn) : figures.radioOff;
}
