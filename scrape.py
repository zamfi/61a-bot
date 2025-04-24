import json
import requests
from bs4 import BeautifulSoup, NavigableString
import re
import argparse
import sys

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

parser = argparse.ArgumentParser(
    description='Scrape a 61a course page for questions',
    epilog='Example usage: python scrape.py --base-url https://inst.eecs.berkeley.edu/~cs61a/sp23/hw/hw{:02d}/ --num-hw 11',
)

parser.add_argument('--base-urls', type=str, nargs='+', default=['https://cs61a.org/hw/hw{:02d}/','https://c88c.org/fa24/hw/hw{:02d}/'], help='URL of the course pages to scrape')
parser.add_argument('--num-hw', type=int, default=-1, help='Number of homeworks to scrape (optional)')
parser.add_argument('--cookie', type=str, default='', help='Cookie to use for authentication (optional)')

# staging server for Fall '23:
# 
# python scrape.py --base-url https://6764.solutions.pr.cs61a.org/hw/hw{:02d}/ --num-hw 7 --cookie session=eyJhY2Nlc3NfdG9rZW4iOnsiIHQiOlsia3c1RWhMc1NKWG5FeFRqMU1kbnBnb2JmeENsTEprIiwiIl19fQ.ZTyxFQ.bg1ZD1kaHOS0XUUPDwgRhGdXEyg > scrapes/fa23.json

args = parser.parse_args()

base_urls = args.base_urls
num_hw = args.num_hw
cookie = args.cookie

def cleanup_text(node):
    for code in node.find_all('code'):
        code.replace_with(f"`{code.get_text()}`")
    for strong in node.find_all('strong'):
        strong.replace_with(f"**{strong.get_text()}**")
    for em in node.find_all('em'):
        em.replace_with(f"*{em.get_text()}*")
    text = ''.join(node.strings)
    text = re.sub(r'\s+', ' ', text.strip())
    text = text.replace('<br>', '  \n')
    return text

def list_to_markdown(ul, depth=0):
    items = []
    for li in ul.find_all("li", recursive=False):
        prefix = '- ' if ul.name == 'ul' else str(len(items) + 1) + '. '
        prefix = '    ' * depth + prefix

        item = prefix + cleanup_text(li)

        sublist = li.find(['ul', 'ol'])
        if sublist:
            item += "\n" + list_to_markdown(sublist, depth + 1)
        items.append(item)
    return "\n".join(items)

def table_to_markdown(table):
    rows = table.find_all('tr')
    table_md = []
    for row in rows:
        row_md = []
        for cell in row.find_all(['td', 'th']):
            cell_text = cleanup_text(cell)
            row_md.append(cell_text)
        table_md.append('| ' + ' | '.join(row_md) + ' |')
        if (len(table_md) == 1):
            table_md.append('| ' + ' | '.join(['---'] * len(row_md)) + ' |')
    return '\n'.join(table_md)

def blockquote_to_markdown(blockquote):
    return '> ' + '\n> '.join(process_content(blockquote).split('\n'))

def get_processor(tag):
    if tag == 'blockquote':
        return blockquote_to_markdown
    else:
        return process_content

def process_element(el):
    if el.name == 'p':
        return cleanup_text(el)
    elif el.name == 'pre':
        return '```\n' + el.get_text().strip() + '\n```'
    elif el.name in ['ol', 'ul']:
        return list_to_markdown(el, 0)
    elif el.name == 'div' and el.get('class') == ['table-responsive']:
        return table_to_markdown(el.find_all('table')[0])
    elif el.name in ['blockquote', 'solution']:
        return get_processor(el.name)(el)

def process_content(tag):
    content = []
    for child in tag.children:
        if isinstance(child, NavigableString):
            continue
        processed = process_element(child)
        if processed:
            content.append(processed)
    return "\n\n".join(content)

def scrape_questions(url, hw_number, course='61a', cookie=''):
    cookies = {}
    if cookie:
        cookies[cookie.split('=')[0]] = cookie.split('=')[1]
    res = requests.get(url, cookies=cookies)
    # bail if we don't get a 200 response
    if res.status_code != 200:
        return None
    soup = BeautifulSoup(res.text, 'html5lib')

    sections = []
    section_tags = soup.select('h1,h2,h3')

    for tag in section_tags:
        if tag.find_parent("footer"):  # Skip elements inside a footer
            continue

        section = {}
        section['hw'] = hw_number
        section['course'] = course

        section_name = cleanup_text(tag)
        if re.match(r'Q\d+', section_name):  # This is a question
            section['type'] = 'question'
            section['number'] = int(section_name.split(':')[0][1:])
            section['title'] = section_name.split(':')[1].strip()
        else:  # This is a preface
            section['type'] = 'preface'
            section['title'] = section_name

        section['text'] = []

        for sibling in tag.next_siblings:
            if isinstance(sibling, NavigableString):
                continue
            if sibling.name in ['h1', 'h2', 'h3']:
                break
            processed = process_element(sibling)
            if processed:
                section['text'].append(processed)
        
        section['text'] = "\n\n".join(section['text'])
        # regex to extract okpy question keyword, which has variable length but no spaces in it
        okpy_q_prefix = 'python3 ok -q '
        okpy_q_suffix = 'Copy'
        okpy_q_match = re.search(okpy_q_prefix + r'([\w-]+)' + okpy_q_suffix, section['text'])
        if okpy_q_match:
            section['okpy_q'] = okpy_q_match.group(1)
        elif section['type'] == 'question':
            eprint(f"Warning: No okpy question keyword found for HW {hw_number} question {section['number']}")
        sections.append(section)

    return sections


def main():
    all_sections = []

    any_succeeded = True
    hw_number = 1
    while any_succeeded:
        any_succeeded = False
        for base_url in base_urls:
            try:
                url = base_url.format(hw_number)
                course = '61a' if ('cs61a' in url) else '88c'
                sections = scrape_questions(url, hw_number, course, cookie)
                if sections:
                    all_sections.extend(sections)
                    any_succeeded = True
                    eprint(f"Scraped HW {hw_number} from {course}")
            except Exception as e:
                eprint(f"Failed to scrape HW {hw_number}: {e}")
        hw_number += 1
        if num_hw > 0 and hw_number > num_hw:
            break
    print(json.dumps(all_sections, indent=2))

if __name__ == "__main__":
    main()
