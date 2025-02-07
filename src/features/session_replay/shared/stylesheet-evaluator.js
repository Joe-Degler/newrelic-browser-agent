import { originals } from '../../../common/config/config'
import { isBrowserScope } from '../../../common/constants/runtime'

class StylesheetEvaluator {
  #evaluated = new WeakSet()
  #fetchProms = []
  /**
  * Flipped to true if stylesheets that cannot be natively inlined are detected by the stylesheetEvaluator class
  * Used at harvest time to denote that all subsequent payloads are subject to this and customers should be advised to handle crossorigin decoration
  * */
  invalidStylesheetsDetected = false
  failedToFix = false

  /**
   * this works by checking (only ever once) each cssRules obj in the style sheets array. The try/catch will catch an error if the cssRules obj blocks access, triggering the module to try to "fix" the asset`. Returns the count of incomplete assets discovered.
   * @returns {Number}
   */
  evaluate () {
    let incompletes = 0
    if (isBrowserScope) {
      for (let i = 0; i < Object.keys(document.styleSheets).length; i++) {
        const ss = document.styleSheets[i]
        if (!this.#evaluated.has(ss)) {
          this.#evaluated.add(ss)
          try {
            // eslint-disable-next-line
            const temp = ss.cssRules
          } catch (err) {
            incompletes++
            this.#fetchProms.push(this.#fetchAndOverride(document.styleSheets[i], ss.href))
          }
        }
      }
    }
    if (incompletes) this.invalidStylesheetsDetected = true
    return incompletes
  }

  /**
   * Resolves promise once all stylesheets have been fetched and overridden
   * @returns {Promise}
   */
  async fix () {
    await Promise.all(this.#fetchProms)
    this.#fetchProms = []
    const failedToFix = this.failedToFix
    this.failedToFix = false
    return failedToFix
  }

  /**
 * Fetches stylesheet contents and overrides the target getters
 * @param {*} target - The stylesheet object target - ex. document.styleSheets[0]
 * @param {*} href - The asset href to fetch
 * @returns {Promise}
 */
  async #fetchAndOverride (target, href) {
    try {
      const stylesheetContents = await originals.FETCH.bind(window)(href)
      if (!stylesheetContents.ok) {
        this.failedToFix = true
        return
      }
      const stylesheetText = await stylesheetContents.text()
      try {
        const cssSheet = new CSSStyleSheet()
        await cssSheet.replace(stylesheetText)
        Object.defineProperty(target, 'cssRules', {
          get () { return cssSheet.cssRules }
        })
        Object.defineProperty(target, 'rules', {
          get () { return cssSheet.rules }
        })
      } catch (err) {
      // cant make new dynamic stylesheets, browser likely doesn't support `.replace()`...
      // this is appended in prep of forking rrweb
        Object.defineProperty(target, 'cssText', {
          get () { return stylesheetText }
        })
        this.failedToFix = true
      }
    } catch (err) {
    // failed to fetch
      this.failedToFix = true
    }
  }
}

export const stylesheetEvaluator = new StylesheetEvaluator()
