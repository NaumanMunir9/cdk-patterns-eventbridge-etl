FROM amazonlinux:latest

WORKDIR /app

RUN yum install -y \
  python3-pip \
  python3 \
  python3-setuptools \
  && yum clean all \
  && rm -rf /var/cache/yum

COPY requirements.txt .
RUN pip3 install -r requirements.txt

COPY main.py .

ENTRYPOINT [ "python3", "/app/main.py" ]