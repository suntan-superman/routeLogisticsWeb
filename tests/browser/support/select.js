const{expect}=require('@playwright/test');
async function selectOptions(control){
 if(await control.evaluate(element=>element.tagName)==='SELECT')return control.getByRole('option');
 if(await control.getAttribute('aria-expanded')!=='true')await control.click();
 const listId=await control.getAttribute('aria-controls');
 expect(listId,'A custom selection exposes its associated listbox').toBeTruthy();
 return control.page().locator(`[role="listbox"][id=${JSON.stringify(listId)}]`).getByRole('option');
}
async function selectValue(control,value){
 if(await control.evaluate(element=>element.tagName)==='SELECT')return control.selectOption(String(value));
 const choices=await selectOptions(control),option=choices.and(control.page().locator(`[data-option-value=${JSON.stringify(String(value))}]`));
 await expect(option,'The intended underlying option exists exactly once').toHaveCount(1);
 await option.click();await expect(control).toHaveAttribute('aria-expanded','false');
 return[String(value)];
}
async function expectSelectValue(control,value){
 if(await control.evaluate(element=>element.tagName)==='SELECT')await expect(control).toHaveValue(String(value));
 else await expect(control).toHaveAttribute('data-selected-value',String(value));
}
module.exports={selectValue,selectOptions,expectSelectValue};
